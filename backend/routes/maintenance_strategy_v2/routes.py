"""Maintenance Strategy v2 Routes — equipment type strategy management."""
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from auth import require_permission
from models.maintenance_strategy_v2 import (
    AddTaskTemplateRequest,
    CreateEquipmentTypeStrategyRequest,
    GenerateTasksRequest,
    RegenerateStrategyRequest,
    UpdateEquipmentTypeStrategyRequest,
    UpdateFailureModeStrategyRequest,
)
from services import maintenance_strategy_v2_service as svc
from services.background_jobs import schedule_tracked_job
from services.maintenance_strategy_v2_service import METADATA_PROPAGATION_KEYS
from utils.auto_translate import translate_maintenance_task

router = APIRouter(prefix="/maintenance-strategies-v2", tags=["Maintenance Strategies V2"])

_library_write = require_permission("library:write")
_library_read = require_permission("library:read")


@router.get("")
async def list_equipment_type_strategies(
    equipment_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(_library_read),
):
    return await svc.list_equipment_type_strategies(
        equipment_type_id=equipment_type_id,
        status=status,
        search=search,
        current_user=current_user,
    )


@router.get("/{equipment_type_id}")
async def get_equipment_type_strategy(
    equipment_type_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_equipment_type_strategy(equipment_type_id, current_user)


@router.post("")
async def create_equipment_type_strategy(
    request: CreateEquipmentTypeStrategyRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.create_equipment_type_strategy(request, current_user)


@router.patch("/{equipment_type_id}")
async def update_equipment_type_strategy(
    equipment_type_id: str,
    request: UpdateEquipmentTypeStrategyRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.update_equipment_type_strategy(
        equipment_type_id, request, current_user
    )


@router.delete("/{equipment_type_id}")
async def delete_equipment_type_strategy(
    equipment_type_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.delete_equipment_type_strategy(equipment_type_id, current_user)


@router.post("/{equipment_type_id}/sync")
async def sync_equipment_type_strategy(
    equipment_type_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.sync_equipment_type_strategy(equipment_type_id, current_user)


@router.get("/{equipment_type_id}/affected-equipment")
async def get_affected_equipment(
    equipment_type_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_affected_equipment(equipment_type_id, current_user)


@router.get("/{equipment_type_id}/version-history")
async def get_strategy_version_history(
    equipment_type_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_strategy_version_history(equipment_type_id, current_user)


@router.get("/{equipment_type_id}/audit-log")
async def get_strategy_audit_log(
    equipment_type_id: str,
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(_library_read),
):
    return await svc.get_strategy_audit_log(
        equipment_type_id, limit=limit, current_user=current_user
    )


@router.get("/{equipment_type_id}/failure-modes")
async def get_failure_mode_strategies(
    equipment_type_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_failure_mode_strategies(equipment_type_id, current_user)


@router.patch("/{equipment_type_id}/failure-modes/{failure_mode_id}")
async def update_failure_mode_strategy(
    equipment_type_id: str,
    failure_mode_id: str,
    request: UpdateFailureModeStrategyRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.update_failure_mode_strategy(
        equipment_type_id, failure_mode_id, request, current_user
    )


@router.post("/{equipment_type_id}/failure-modes/{failure_mode_id}/sync")
async def sync_failure_mode_from_library(
    equipment_type_id: str,
    failure_mode_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.sync_failure_mode_from_library(
        equipment_type_id, failure_mode_id, current_user
    )


@router.get("/{equipment_type_id}/tasks")
async def get_task_templates(
    equipment_type_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_task_templates(equipment_type_id, current_user)


@router.post("/{equipment_type_id}/tasks")
async def add_task_template(
    equipment_type_id: str,
    request: AddTaskTemplateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_library_write),
):
    result = await svc.add_task_template(equipment_type_id, request, current_user)
    schedule_tracked_job(
        background_tasks,
        "translate_maintenance_task",
        translate_maintenance_task,
        result["id"],
        {
            "name": request.name,
            "description": request.description or "",
            "procedure_steps": request.procedure_steps or [],
        },
        user_id=current_user.get("id"),
    )
    return result


@router.patch("/{equipment_type_id}/tasks/{task_id}")
async def update_task_template(
    equipment_type_id: str,
    task_id: str,
    updates: Dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_library_write),
):
    result = await svc.update_task_template(
        equipment_type_id, task_id, updates, current_user
    )
    translate_ctx = result.pop("_translation_context", None)
    if translate_ctx:
        schedule_tracked_job(
            background_tasks,
            "translate_maintenance_task",
            translate_maintenance_task,
            task_id,
            translate_ctx,
            user_id=current_user.get("id"),
        )
    return result


@router.delete("/{equipment_type_id}/tasks/{task_id}")
async def delete_task_template(
    equipment_type_id: str,
    task_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.delete_task_template(equipment_type_id, task_id, current_user)


@router.post("/{equipment_type_id}/generate-tasks")
async def generate_tasks_for_equipment(
    equipment_type_id: str,
    request: GenerateTasksRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.generate_tasks_for_equipment(
        equipment_type_id, request, current_user
    )


@router.get("/equipment/{equipment_id}")
async def get_equipment_strategy_instance(
    equipment_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_equipment_strategy_instance(equipment_id, current_user)


@router.patch("/equipment/{equipment_id}/tasks/{task_id}")
async def override_equipment_task(
    equipment_id: str,
    task_id: str,
    updates: Dict[str, Any],
    current_user: dict = Depends(_library_write),
):
    return await svc.override_equipment_task(
        equipment_id, task_id, updates, current_user
    )


@router.post("/equipment/{equipment_id}/disable-failure-mode")
async def disable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(_library_write),
):
    return await svc.disable_failure_mode_for_equipment(
        equipment_id, failure_mode_id, reason=reason, current_user=current_user
    )


@router.post("/equipment/{equipment_id}/regenerate")
async def regenerate_equipment_tasks(
    equipment_id: str,
    request: RegenerateStrategyRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.regenerate_equipment_tasks(equipment_id, request, current_user)


@router.post("/equipment/{equipment_id}/local-tasks")
async def add_local_task(
    equipment_id: str,
    request: AddTaskTemplateRequest,
    current_user: dict = Depends(_library_write),
):
    return await svc.add_local_task(equipment_id, request, current_user)


@router.delete("/equipment/{equipment_id}/local-tasks/{task_id}")
async def delete_local_task(
    equipment_id: str,
    task_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.delete_local_task(equipment_id, task_id, current_user)


@router.post("/equipment/{equipment_id}/enable-failure-mode")
async def enable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str,
    current_user: dict = Depends(_library_write),
):
    return await svc.enable_failure_mode_for_equipment(
        equipment_id, failure_mode_id, current_user
    )


@router.get("/equipment/{equipment_id}/sync-status")
async def get_equipment_sync_status(
    equipment_id: str,
    current_user: dict = Depends(_library_read),
):
    return await svc.get_equipment_sync_status(equipment_id, current_user)
