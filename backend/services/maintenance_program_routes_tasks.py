"""Maintenance program routes — task management."""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from database import db
from models.maintenance_program import AddTaskRequest, TaskSource, UpdateTaskRequest
from services.maintenance_program_pm_import import parse_pm_import_ref
from services.maintenance_program_routes_helpers import (
    current_user_id,
    refresh_equipment_schedule_after_active_toggle,
    refresh_equipment_schedule_after_change,
)
from services.maintenance_program_service import MaintenanceProgramService
from services.maintenance_tenant_scope import maintenance_scoped


async def get_program_tasks(
    equipment_id: str,
    source: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None, *, current_user: dict
):
    """
    Get tasks for a maintenance program with optional filtering.

    Query Parameters:
    - source: Filter by task source (strategy_generated, customer_imported, ai_generated, manual)
    - category: Filter by task category
    - is_active: Filter by active status
    """
    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped(current_user, {"equipment_id": equipment_id}),
        {"_id": 0, "tasks": 1}
    )

    if not program:
        raise HTTPException(status_code=404, detail="Maintenance program not found")

    tasks = program.get("tasks", [])

    if source:
        tasks = [t for t in tasks if t.get("task_source") == source]
    if category:
        tasks = [t for t in tasks if t.get("task_category") == category]
    if is_active is not None:
        tasks = [t for t in tasks if t.get("is_active", True) == is_active]

    return {
        "tasks": tasks,
        "total": len(tasks)
    }


async def add_task(
    equipment_id: str,
    request: AddTaskRequest, current_user: dict,
):
    """Add a manual task to a maintenance program."""
    try:
        task, new_version = await MaintenanceProgramService.add_task(
            equipment_id=equipment_id,
            task_title=request.task_title,
            task_description=request.task_description,
            frequency=request.frequency,
            estimated_duration_hours=request.estimated_duration_hours,
            task_category=request.task_category,
            task_source=TaskSource.MANUAL,
            priority=request.priority,
            skill_requirement=request.skill_requirement,
            discipline=request.discipline,
            procedure_steps=request.procedure_steps,
            acceptance_criteria=request.acceptance_criteria,
            tools_required=request.tools_required,
            spare_parts=request.spare_parts,
            user_id=current_user_id(current_user)
        )

        schedule_refresh = await refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Task added",
            "task": task.model_dump(),
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


async def update_task(
    equipment_id: str,
    task_id: str,
    request: UpdateTaskRequest, current_user: dict,
):
    """
    Update or override a task in a maintenance program.
    For strategy-generated tasks, this creates an override.
    """
    updates = {}

    if request.task_title is not None:
        updates["task_title"] = request.task_title
    if request.task_description is not None:
        updates["task_description"] = request.task_description
    if request.frequency is not None:
        updates["frequency"] = request.frequency.value
    if request.estimated_duration_hours is not None:
        updates["estimated_duration_hours"] = request.estimated_duration_hours
    if request.task_category is not None:
        updates["task_category"] = request.task_category.value
    if request.priority is not None:
        updates["priority"] = request.priority.value
    if request.skill_requirement is not None:
        updates["skill_requirement"] = request.skill_requirement.value
    if request.discipline is not None:
        updates["discipline"] = request.discipline
    if request.procedure_steps is not None:
        updates["procedure_steps"] = request.procedure_steps
    if request.acceptance_criteria is not None:
        updates["acceptance_criteria"] = request.acceptance_criteria
    if request.is_active is not None:
        updates["is_active"] = request.is_active
    if request.is_mandatory is not None:
        updates["is_mandatory"] = request.is_mandatory
    if request.spare_part_requirements is not None:
        updates["spare_part_requirements"] = [
            req.model_dump() if hasattr(req, "model_dump") else req
            for req in request.spare_part_requirements
        ]

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    is_active_only = set(updates.keys()) == {"is_active"}

    try:
        updated_task, new_version = await MaintenanceProgramService.update_task(
            equipment_id=equipment_id,
            task_id=task_id,
            updates=updates,
            override_reason=request.override_reason,
            user_id=current_user_id(current_user)
        )

        if request.spare_part_requirements is not None:
            from services.spare_part_requirements_service import apply_program_task_requirements

            await apply_program_task_requirements(
                user=current_user,
                equipment_id=equipment_id,
                task_id=task_id,
                requirements=request.spare_part_requirements,
            )

        schedule_refresh = None
        pm_ref_parts = parse_pm_import_ref(task=updated_task, task_id=task_id)
        if pm_ref_parts and updates.get("is_active") is not None:
            session_id, pm_task_id, _pm_ref = pm_ref_parts
            schedule_refresh = await MaintenanceProgramService.propagate_pm_import_task_active_state(
                session_id,
                pm_task_id,
                bool(updates["is_active"]),
                user_id=current_user_id(current_user),
            )
        elif is_active_only:
            trace = (updated_task or {}).get("traceability") or {}
            schedule_refresh = await refresh_equipment_schedule_after_active_toggle(
                equipment_id,
                enable=bool(updates["is_active"]),
                v2_task_id=task_id,
                template_id=trace.get("task_template_id"),
                current_user=current_user,
            )
        else:
            schedule_refresh = await refresh_equipment_schedule_after_change(
                equipment_id, current_user
            )

        return {
            "message": "Task updated",
            "task": updated_task,
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


async def delete_task(
    equipment_id: str,
    task_id: str, current_user: dict,
):
    """Delete a task from a maintenance program."""
    try:
        new_version = await MaintenanceProgramService.delete_task(
            equipment_id=equipment_id,
            task_id=task_id,
            user_id=current_user_id(current_user)
        )

        from services.spare_parts_graph_sync import retire_requires_edges
        from services.tenant_schema import tenant_id_from_user

        await retire_requires_edges(
            source_type="program_task",
            source_id=task_id,
            tenant_id=tenant_id_from_user(current_user),
        )

        schedule_refresh = await refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Task deleted",
            "task_id": task_id,
            "version": new_version,
            "schedule_refresh": schedule_refresh,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
