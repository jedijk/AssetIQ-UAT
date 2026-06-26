"""AI maintenance task recommendations — extracted from maintenance_program_service."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from database import db
from services.maintenance_tenant_scope import maintenance_scoped
from models.maintenance_program import (
    MaintenanceProgramTask,
    TaskCategory,
    TaskFrequency,
    TaskPriority,
    TaskSource,
    TaskTraceability,
    frequency_to_days,
)

logger = logging.getLogger(__name__)


async def generate_ai_recommendations(
    equipment_id: str,
    include_failure_history: bool = True,
    include_industry_standards: bool = True,
    max_recommendations: int = 10,
    user_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> List[MaintenanceProgramTask]:
    """Generate AI maintenance recommendations for an equipment program."""

    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped(user, {"equipment_id": equipment_id})
    )
    if not program:
        raise ValueError(f"No maintenance program found for equipment: {equipment_id}")

    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped(user, {"id": equipment_id}),
        {"_id": 0},
    )
    if not equipment:
        raise ValueError(f"Equipment not found: {equipment_id}")

    equipment_type = equipment.get("equipment_type_name", "Unknown Equipment")
    criticality = program.get("criticality_level", "medium")
    existing_tasks = [t.get("task_title") for t in program.get("tasks", [])]

    failure_context = ""
    if include_failure_history:
        observations = await db.observations.find(
            maintenance_scoped(user, {"equipment_id": equipment_id}),
            {"title": 1, "description": 1, "failure_mode": 1, "_id": 0},
        ).sort("created_at", -1).limit(20).to_list(20)
        if observations:
            failure_context = "\n\nRecent failure history:\n"
            for obs in observations:
                failure_context += f"- {obs.get('title', 'Unknown')}: {obs.get('failure_mode', 'N/A')}\n"

    fm_context = ""
    if include_industry_standards and equipment.get("equipment_type_id"):
        failure_modes = await db.failure_modes.find(
            {"equipment_type": equipment_type},
            {"failure_mode": 1, "detection_methods": 1, "_id": 0},
        ).limit(30).to_list(30)
        if failure_modes:
            fm_context = f"\n\nKnown failure modes for {equipment_type}:\n"
            for fm in failure_modes:
                fm_context += f"- {fm.get('failure_mode', 'Unknown')}\n"

    existing_tasks_block = (
        chr(10).join([f"- {t}" for t in existing_tasks[:20]])
        if existing_tasks
        else "- None currently defined"
    )

    try:
        from services.ai_platform import execute_json_prompt
        from services.ai_prompt_registry import render_prompt

        user_message = render_prompt(
            "maintenance.program_recommendations.user",
            {
                "equipment_name": equipment.get("name", equipment_id),
                "equipment_type": equipment_type,
                "criticality": criticality,
                "existing_tasks_block": existing_tasks_block,
                "failure_context": failure_context,
                "fm_context": fm_context,
                "max_recommendations": str(max_recommendations),
            },
        )
        actor = user or {"id": user_id or "maintenance-program"}
        result = await execute_json_prompt(
            "maintenance.program_recommendations",
            user=actor,
            user_message=user_message,
            endpoint="maintenance_program.ai_recommendations",
            model="gpt-4o-mini",
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        response_data = result["parsed"] or {}
        if isinstance(response_data, dict):
            recommendations = response_data.get("recommendations", response_data.get("tasks", []))
            if not recommendations and "task_title" in response_data:
                recommendations = [response_data]
        elif isinstance(response_data, list):
            recommendations = response_data
        else:
            recommendations = []

        ai_tasks = []
        for rec in recommendations[:max_recommendations]:
            freq_str = rec.get("frequency", "monthly").lower()
            try:
                frequency = TaskFrequency(freq_str)
            except ValueError:
                frequency = TaskFrequency.MONTHLY

            cat_str = rec.get("category", "preventive_maintenance").lower()
            try:
                category = TaskCategory(cat_str)
            except ValueError:
                category = TaskCategory.PREVENTIVE_MAINTENANCE

            ai_tasks.append(
                MaintenanceProgramTask(
                    id=str(uuid.uuid4()),
                    task_title=rec.get("task_title", "AI Recommended Task"),
                    task_description=rec.get("description"),
                    frequency=frequency,
                    frequency_days=frequency_to_days(frequency.value),
                    estimated_duration_hours=rec.get("duration_hours", 1.0),
                    task_category=category,
                    task_source=TaskSource.AI_GENERATED,
                    priority=TaskPriority.MEDIUM,
                    is_active=False,
                    traceability=TaskTraceability(
                        ai_model="gpt-4o-mini",
                        ai_confidence=0.85,
                        ai_reasoning=rec.get("reasoning"),
                    ),
                    created_by=user_id,
                )
            )

        if ai_tasks:
            await db.maintenance_programs_v2.update_one(
                maintenance_scoped(user, {"equipment_id": equipment_id}),
                {
                    "$set": {
                        "last_ai_analysis_date": datetime.utcnow().isoformat(),
                        "ai_recommendations_pending": len(ai_tasks),
                    }
                },
            )

        from services.maintenance_program_service import MaintenanceProgramService

        await MaintenanceProgramService._log_audit(
            action="generate_ai_recommendations",
            equipment_id=equipment_id,
            user_id=user_id,
            details={"recommendations_count": len(ai_tasks)},
        )
        return ai_tasks
    except Exception as e:
        logger.error("AI recommendation generation failed: %s", e)
        raise


async def accept_ai_recommendation(
    equipment_id: str,
    task: MaintenanceProgramTask,
    user_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> Tuple[MaintenanceProgramTask, str]:
    """Accept an AI recommendation and add it to the program."""
    from services.maintenance_program_service import MaintenanceProgramService

    task.is_active = True
    result_task, new_version = await MaintenanceProgramService.add_task(
        equipment_id=equipment_id,
        task_title=task.task_title,
        task_description=task.task_description,
        frequency=task.frequency,
        estimated_duration_hours=task.estimated_duration_hours,
        task_category=task.task_category,
        task_source=TaskSource.AI_GENERATED,
        priority=task.priority,
        skill_requirement=task.skill_requirement,
        procedure_steps=task.procedure_steps,
        traceability=task.traceability,
        user_id=user_id,
    )
    await db.maintenance_programs_v2.update_one(
        maintenance_scoped(user, {"equipment_id": equipment_id}),
        {"$inc": {"ai_recommendations_pending": -1}},
    )
    return result_task, new_version
