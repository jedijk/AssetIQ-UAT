"""AI maintenance planner — LLM recommendations and apply."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException

from database import db
from models.maintenance_scheduler import AIScheduleRequest, TaskStatus
from services.maintenance_scheduler_scope import scheduler_scoped

logger = logging.getLogger(__name__)


async def ai_plan_tasks(
    user: dict,
    request: Optional[AIScheduleRequest] = None,
) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY or EMERGENT_LLM_KEY not configured",
        )

    if request is None:
        request = AIScheduleRequest(
            start_date=datetime.utcnow().date().isoformat(),
            end_date=(datetime.utcnow().date() + timedelta(days=14)).isoformat(),
        )

    task_query = scheduler_scoped(user, {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "due_date": {"$lte": request.end_date},
    })
    tasks = await db.scheduled_tasks.find(task_query, {"_id": 0}).to_list(200)

    if not tasks:
        return {
            "message": "No open tasks to plan",
            "recommendations": [],
            "summary": "There are no open scheduled tasks in the planning window. Run the scheduler first.",
        }

    tech_query = scheduler_scoped(user, {"is_active": True})
    if request.technician_ids:
        tech_query = scheduler_scoped(
            user,
            {"is_active": True, "id": {"$in": request.technician_ids}},
        )
    technicians = await db.technician_capacity.find(tech_query, {"_id": 0}).to_list(100)

    today = datetime.utcnow().date().isoformat()
    tasks_context = []
    for t in tasks[:50]:
        tasks_context.append({
            "id": t.get("id"),
            "task_name": t.get("task_name"),
            "equipment_name": t.get("equipment_name"),
            "equipment_tag": t.get("equipment_tag"),
            "priority": t.get("priority"),
            "due_date": t.get("due_date"),
            "estimated_hours": t.get("estimated_hours", 1.0),
            "is_overdue": (t.get("due_date") or today) < today,
            "task_type": t.get("task_type"),
            "currently_assigned": t.get("assigned_technician_name"),
        })

    techs_context = [{
        "id": tech.get("id"),
        "name": tech.get("name"),
        "weekly_hours": tech.get("weekly_available_hours", 40),
        "daily_hours": tech.get("daily_available_hours", 8),
        "disciplines": tech.get("disciplines", []),
        "skills": tech.get("skills", []),
    } for tech in technicians]

    user_payload = {
        "today": today,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "tasks": tasks_context,
        "technicians": techs_context,
    }

    session_id = f"ai-plan-{uuid.uuid4()}"
    logger.debug("AI planner session %s", session_id)

    try:
        from services.ai_platform import execute_json_prompt

        result = await execute_json_prompt(
            "maintenance.scheduler_plan",
            user=user,
            user_message=json.dumps(user_payload),
            endpoint="maintenance_scheduler.ai_plan",
            model="gpt-4o",
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        parsed = result["parsed"]
    except Exception as e:
        logger.exception("AI planner LLM call failed")
        raise HTTPException(status_code=502, detail=f"AI planner failed: {str(e)}") from e

    if not parsed:
        logger.error("Failed to parse AI planner response")
        raise HTTPException(
            status_code=502,
            detail="AI returned non-JSON response",
        )

    return {
        "message": "AI plan generated",
        "summary": parsed.get("summary", ""),
        "recommendations": parsed.get("recommendations", []),
        "tasks_analyzed": len(tasks_context),
        "technicians_considered": len(techs_context),
    }


async def apply_ai_plan(user: dict, recommendations: list) -> dict:
    if not recommendations:
        raise HTTPException(status_code=400, detail="No recommendations provided")

    applied = 0
    now = datetime.utcnow().isoformat()
    for rec in recommendations:
        update_data = {
            "updated_at": now,
            "ai_scheduled": True,
            "ai_reasoning": rec.reasoning,
        }
        if rec.planned_date:
            update_data["planned_date"] = rec.planned_date
        if rec.assigned_technician_id:
            update_data["assigned_technician_id"] = rec.assigned_technician_id
            update_data["assigned_technician_name"] = rec.assigned_technician_name
            update_data["status"] = TaskStatus.ASSIGNED.value

        result = await db.scheduled_tasks.update_one(
            scheduler_scoped(user, {"id": rec.task_id}),
            {"$set": update_data},
        )
        if result.modified_count > 0:
            applied += 1

    return {"message": "AI plan applied", "tasks_updated": applied}
