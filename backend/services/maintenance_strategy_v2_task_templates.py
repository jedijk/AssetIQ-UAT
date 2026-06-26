"""Task template CRUD for maintenance strategy v2 (extracted for LOC limits)."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from database import db
from models.maintenance_strategy_v2 import (
    AddTaskTemplateRequest,
    CriticalityFrequency,
    MaintenanceTaskTemplate,
)
from services.maintenance_tenant_scope import maintenance_scoped
from services.maintenance_scheduler_sync import propagate_strategy_schedule_updates
from services.maintenance_strategy_helpers import clear_strategy_needs_apply
from services.maintenance_strategy_propagation import (
    METADATA_PROPAGATION_KEYS,
    _bump_strategy_version,
    _cancel_open_scheduled_tasks_for_task,
    _deactivate_programs_for_task,
    _describe_task_change,
    _propagate_task_template_to_programs,
    _sync_metadata_to_open_scheduled_tasks,
    is_mandatory_only_task_toggle,
)
from services.program_task_resolution import (
    count_active_maintenance_programs_for_task_template,
)

logger = logging.getLogger(__name__)


async def _refresh_applied_equipment_timeline(
    equipment_type_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        return await propagate_strategy_schedule_updates(
            equipment_type_id,
            user_id=user_id,
        )
    except Exception as exc:
        logger.exception(
            "Schedule timeline refresh failed for equipment type %s: %s",
            equipment_type_id,
            exc,
        )
        return {}


async def get_task_templates(equipment_type_id: str, current_user: dict):
    """Get all task templates for an equipment type."""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
        {"_id": 0},
    )

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    return {
        "task_templates": strategy.get("task_templates", []),
        "total": len(strategy.get("task_templates", [])),
    }


async def add_task_template(
    equipment_type_id: str,
    request: AddTaskTemplateRequest,
    current_user: dict,
):
    """Add a new task template to an equipment type strategy."""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id})
    )

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    freq_matrix = request.frequency_matrix or CriticalityFrequency()

    task = MaintenanceTaskTemplate(
        id=f"task_{uuid.uuid4()}",
        name=request.name,
        description=request.description,
        task_type=request.task_type,
        frequency_matrix=freq_matrix,
        duration_hours=request.duration_hours,
        skills_required=request.skills_required,
        discipline=request.discipline,
        detection_methods=request.detection_methods,
        failure_mode_ids=request.failure_mode_ids,
        procedure_steps=request.procedure_steps,
        source="manual",
    )

    task_dict = task.model_dump()

    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$push": {"task_templates": task_dict},
            "$inc": {"total_tasks": 1},
            "$set": {"updated_at": datetime.utcnow().isoformat()},
        },
    )

    new_version = await _bump_strategy_version(
        strategy,
        changes=[_describe_task_change(task_dict, [], action="add")],
        user_id=current_user.get("user_id"),
    )

    schedule_refresh = await _refresh_applied_equipment_timeline(
        equipment_type_id,
        user_id=current_user.get("user_id"),
    )

    return {
        **task_dict,
        "version": new_version,
        "strategy_needs_apply": True,
        "schedule_refresh": schedule_refresh,
    }


async def update_task_template(
    equipment_type_id: str,
    task_id: str,
    updates: Dict[str, Any],
    current_user: dict,
):
    """Update a task template; metadata-only changes propagate to programs and open scheduled tasks."""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id})
    )

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    task_templates = strategy.get("task_templates", [])
    updated = False
    updated_task = None

    for i, task in enumerate(task_templates):
        if task.get("id") == task_id:
            for key, value in updates.items():
                if key in [
                    "name", "description", "task_type", "duration_hours",
                    "skills_required", "discipline", "detection_methods",
                    "failure_mode_ids", "procedure_steps", "is_mandatory",
                    "tools_required", "spare_parts", "estimated_cost_eur",
                ]:
                    task_templates[i][key] = value
                elif key == "frequency_matrix" and isinstance(value, dict):
                    task_templates[i]["frequency_matrix"] = value
            updated = True
            updated_task = task_templates[i]
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Task template not found")

    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "task_templates": task_templates,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    new_version = await _bump_strategy_version(
        strategy,
        changes=[_describe_task_change(updated_task, list(updates.keys()))],
        user_id=current_user.get("user_id"),
    )

    metadata_only = bool(updates) and set(updates.keys()).issubset(METADATA_PROPAGATION_KEYS)
    mandatory_only = is_mandatory_only_task_toggle(updates)
    propagation = {}
    needs_apply = True
    if metadata_only and updated_task:
        propagation["programs_updated"] = await _propagate_task_template_to_programs(
            equipment_type_id, updated_task, new_version
        )
        propagation["scheduled_tasks_updated"] = await _sync_metadata_to_open_scheduled_tasks(
            equipment_type_id, updated_task
        )
        await clear_strategy_needs_apply(
            equipment_type_id,
            applied_version=new_version,
        )
        needs_apply = False
    elif mandatory_only:
        from services.strategy_propagation import resync_programs_with_strategy

        propagation["program_resync"] = await resync_programs_with_strategy(
            equipment_type_id
        )
        await clear_strategy_needs_apply(
            equipment_type_id,
            applied_version=new_version,
        )
        needs_apply = False

    response = {
        "message": "Task template updated",
        "task_id": task_id,
        "version": new_version,
        "strategy_needs_apply": needs_apply,
        "metadata_propagated": metadata_only,
        "toggle_propagated": mandatory_only,
        **propagation,
    }
    if not metadata_only and not mandatory_only:
        response["schedule_refresh"] = await _refresh_applied_equipment_timeline(
            equipment_type_id,
            user_id=current_user.get("user_id"),
        )
    if updated_task and any(
        k in updates for k in ["name", "description", "procedure_steps"]
    ):
        response["_translation_context"] = {
            "name": updated_task.get("name", ""),
            "description": updated_task.get("description", ""),
            "procedure_steps": updated_task.get("procedure_steps", []),
        }
    return response


async def get_task_template_program_impact(
    equipment_type_id: str,
    task_id: str,
    current_user: dict,
):
    """Return how many active maintenance programs include this strategy task."""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id})
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if not any(t.get("id") == task_id for t in strategy.get("task_templates", [])):
        raise HTTPException(status_code=404, detail="Task template not found")

    active_program_count = await count_active_maintenance_programs_for_task_template(
        equipment_type_id,
        task_id,
    )
    return {
        "task_template_id": task_id,
        "active_program_count": active_program_count,
        "has_impact": active_program_count > 0,
    }


async def delete_task_template(
    equipment_type_id: str,
    task_id: str,
    current_user: dict,
):
    """Delete a task template; deactivates v2 program tasks and cancels open scheduled tasks."""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id})
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    deleted_task = next(
        (t for t in strategy.get("task_templates", []) if t.get("id") == task_id),
        None,
    )

    result = await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$pull": {"task_templates": {"id": task_id}},
            "$inc": {"total_tasks": -1},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task template not found")

    new_version = await _bump_strategy_version(
        strategy,
        changes=[_describe_task_change(deleted_task or {"name": "Task"}, [], action="delete")],
        user_id=current_user.get("user_id"),
    )

    programs_deactivated = await _deactivate_programs_for_task(equipment_type_id, task_id)
    scheduled_cancelled = await _cancel_open_scheduled_tasks_for_task(equipment_type_id, task_id)
    schedule_refresh = await _refresh_applied_equipment_timeline(
        equipment_type_id,
        user_id=current_user.get("user_id"),
    )

    return {
        "message": "Task template deleted",
        "task_id": task_id,
        "version": new_version,
        "strategy_needs_apply": True,
        "programs_deactivated": programs_deactivated,
        "scheduled_tasks_cancelled": scheduled_cancelled,
        "schedule_refresh": schedule_refresh,
    }
