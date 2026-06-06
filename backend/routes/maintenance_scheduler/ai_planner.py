"""
AI Maintenance Planner: uses OpenAI gpt-4o via Emergent LLM Key to produce
assignment + planned_date suggestions with explicit reasoning per task.
"""
import json
import logging
import os
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException

from database import db
from auth import require_permission
from models.maintenance_scheduler import (
    TaskStatus,
    AIScheduleRequest,
)
from ._shared import ApplyAIPlanRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ai-plan")
async def ai_plan_tasks(
    request: AIScheduleRequest = None,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """
    AI Maintenance Planner: optimizes task assignments and planned dates
    using OpenAI gpt-4o via Emergent LLM key. Returns recommendations with
    explicit reasoning per task.
    """
    try:
        from services.ai_gateway import chat, user_context
    except ImportError:
        raise HTTPException(status_code=500, detail="OpenAI service not available")

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

    task_query = {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "due_date": {"$lte": request.end_date},
    }
    tasks = await db.scheduled_tasks.find(task_query, {"_id": 0}).to_list(200)

    if not tasks:
        return {
            "message": "No open tasks to plan",
            "recommendations": [],
            "summary": "There are no open scheduled tasks in the planning window. Run the scheduler first.",
        }

    tech_query = {"is_active": True}
    if request.technician_ids:
        tech_query["id"] = {"$in": request.technician_ids}
    technicians = await db.technician_capacity.find(tech_query, {"_id": 0}).to_list(100)

    today = datetime.utcnow().date().isoformat()
    tasks_context = []
    for t in tasks[:50]:  # Cap to 50 tasks to keep prompt focused
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

    system_message = (
        "You are an industrial maintenance planning expert. Given a set of open "
        "maintenance tasks and available technicians with their daily/weekly capacity, "
        "produce a balanced optimised plan. For each task you must: "
        "1) assign a technician (or leave null if none suitable / no technicians available), "
        "2) propose a planned_date between start_date and end_date, "
        "3) provide explicit short reasoning (criticality, due-date pressure, capacity, skill fit). "
        "Respect daily capacity: never exceed a technician's daily_hours on any day. "
        "Prioritise overdue and critical/high priority tasks earliest. Return ONLY valid JSON "
        "matching this schema: "
        '{"summary": "<2-3 sentence overall plan rationale>", '
        '"recommendations": [{"task_id": "...", "assigned_technician_id": "..." | null, '
        '"assigned_technician_name": "..." | null, "planned_date": "YYYY-MM-DD", '
        '"reasoning": "..."}]} '
        "Do NOT wrap in markdown code fences."
    )

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
        uid, cid = user_context(current_user)
        response_text = await chat(
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            model="gpt-4o",
            response_format={"type": "json_object"},
            user_id=uid,
            company_id=cid,
            endpoint="maintenance_scheduler.ai_plan",
        )
    except Exception as e:
        logger.exception("AI planner LLM call failed")
        raise HTTPException(status_code=502, detail=f"AI planner failed: {str(e)}")

    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip().rstrip("`").strip()

    try:
        parsed = json.loads(cleaned)
    except Exception as e:
        logger.error("Failed to parse AI response: %s", response_text[:500])
        raise HTTPException(
            status_code=502,
            detail=f"AI returned non-JSON response: {str(e)}",
        )

    return {
        "message": "AI plan generated",
        "summary": parsed.get("summary", ""),
        "recommendations": parsed.get("recommendations", []),
        "tasks_analyzed": len(tasks_context),
        "technicians_considered": len(techs_context),
    }


@router.post("/ai-plan/apply")
async def apply_ai_plan(
    request: ApplyAIPlanRequest,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """Apply selected AI recommendations to scheduled tasks."""
    if not request.recommendations:
        raise HTTPException(status_code=400, detail="No recommendations provided")

    applied = 0
    now = datetime.utcnow().isoformat()
    for rec in request.recommendations:
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
            {"id": rec.task_id},
            {"$set": update_data},
        )
        if result.modified_count > 0:
            applied += 1

    return {"message": "AI plan applied", "tasks_updated": applied}
