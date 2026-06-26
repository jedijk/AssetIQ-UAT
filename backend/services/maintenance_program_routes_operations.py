"""Maintenance program routes — program operations (regenerate, import, AI)."""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import HTTPException

from models.maintenance_program import (
    AIRecommendationRequest,
    ImportTasksRequest,
    MaintenanceProgramTask,
    RegenerateProgramRequest,
)
from services.maintenance_program_routes_helpers import (
    current_user_id,
    refresh_equipment_schedule_after_change,
)
from services.maintenance_program_service import MaintenanceProgramService

logger = logging.getLogger(__name__)


async def regenerate_program(
    equipment_id: str,
    request: RegenerateProgramRequest, current_user: dict,
):
    """
    Regenerate a maintenance program from the equipment type strategy.

    Options:
    - preserve_overrides: Keep manual overrides (default: true)
    - preserve_manual_tasks: Keep manually added tasks (default: true)
    - preserve_imported_tasks: Keep imported tasks (default: true)
    - preview_only: Only show what would change (default: false)
    """
    try:
        program, preview = await MaintenanceProgramService.regenerate_program(
            equipment_id=equipment_id,
            preserve_overrides=request.preserve_overrides,
            preserve_manual_tasks=request.preserve_manual_tasks,
            preserve_imported_tasks=request.preserve_imported_tasks,
            preview_only=request.preview_only,
            user_id=current_user_id(current_user)
        )

        if request.preview_only:
            return {
                "message": "Regeneration preview",
                "preview": preview.model_dump()
            }

        schedule_refresh = await refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Program regenerated",
            "program": program.model_dump(),
            "changes": preview.model_dump(),
            "schedule_refresh": schedule_refresh,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def import_tasks(
    equipment_id: str,
    request: ImportTasksRequest, current_user: dict,
):
    """Import tasks from a PM Import session into this maintenance program."""
    try:
        imported_count, new_version = await MaintenanceProgramService.import_tasks_from_session(
            equipment_id=equipment_id,
            import_session_id=request.import_session_id,
            task_ids=request.task_ids,
            user_id=current_user_id(current_user)
        )

        schedule_refresh = await refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": f"Imported {imported_count} tasks",
            "tasks_imported": imported_count,
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


async def generate_ai_recommendations(
    equipment_id: str,
    request: AIRecommendationRequest, current_user: dict,
):
    """
    Generate AI maintenance recommendations for this equipment.
    Recommendations are returned but not automatically added to the program.
    """
    try:
        recommendations = await MaintenanceProgramService.generate_ai_recommendations(
            equipment_id=equipment_id,
            include_failure_history=request.include_failure_history,
            include_industry_standards=request.include_industry_standards,
            max_recommendations=request.max_recommendations,
            user_id=current_user_id(current_user),
            user=current_user,
        )

        return {
            "message": f"Generated {len(recommendations)} recommendations",
            "recommendations": [r.model_dump() for r in recommendations]
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"AI recommendation generation failed: {e}")
        raise HTTPException(status_code=500, detail="AI recommendation generation failed")


async def accept_ai_recommendation(
    equipment_id: str,
    task: Dict[str, Any], current_user: dict,
):
    """Accept an AI recommendation and add it to the maintenance program."""
    try:
        task_obj = MaintenanceProgramTask(**task)

        result_task, new_version = await MaintenanceProgramService.accept_ai_recommendation(
            equipment_id=equipment_id,
            task=task_obj,
            user_id=current_user_id(current_user),
            user=current_user,
        )

        return {
            "message": "AI recommendation accepted",
            "task": result_task.model_dump(),
            "version": new_version
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
