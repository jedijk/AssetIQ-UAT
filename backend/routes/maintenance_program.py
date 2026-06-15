"""Maintenance Program Routes."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user, require_permission
from models.maintenance_program import (
    AddTaskRequest,
    AIRecommendationRequest,
    ApprovalRequest,
    CreateMaintenanceProgramRequest,
    ImportTasksRequest,
    MaintenanceProgramTask,
    ProgramStatus,
    RegenerateProgramRequest,
    UpdateTaskRequest,
)
from services import maintenance_program_routes_service as svc

router = APIRouter(prefix="/maintenance-programs", tags=["Maintenance Programs"])

_scheduler_write = require_permission("scheduler:write")


@router.get("")
async def list_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    return await svc.list_maintenance_programs(
        equipment_type_id=equipment_type_id,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
        current_user=current_user,
    )


@router.get("/summary")
async def get_programs_summary(
    equipment_type_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_programs_summary(
        equipment_type_id=equipment_type_id, current_user=current_user
    )


@router.get("/{equipment_id}")
async def get_maintenance_program(
    equipment_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_maintenance_program(equipment_id, current_user)


@router.post("/{equipment_id}")
async def create_maintenance_program(
    equipment_id: str,
    request: CreateMaintenanceProgramRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.create_maintenance_program(
        equipment_id, request, current_user=current_user
    )


@router.delete("/{equipment_id}")
async def delete_maintenance_program(
    equipment_id: str,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.delete_maintenance_program(equipment_id, current_user=current_user)


@router.get("/{equipment_id}/tasks")
async def get_program_tasks(
    equipment_id: str,
    source: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_program_tasks(
        equipment_id,
        source=source,
        category=category,
        is_active=is_active,
        current_user=current_user,
    )


@router.post("/{equipment_id}/tasks")
async def add_task(
    equipment_id: str,
    request: AddTaskRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.add_task(equipment_id, request, current_user=current_user)


@router.patch("/{equipment_id}/tasks/{task_id}")
async def update_task(
    equipment_id: str,
    task_id: str,
    request: UpdateTaskRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.update_task(
        equipment_id, task_id, request, current_user=current_user
    )


@router.delete("/{equipment_id}/tasks/{task_id}")
async def delete_task(
    equipment_id: str,
    task_id: str,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.delete_task(equipment_id, task_id, current_user=current_user)


@router.post("/{equipment_id}/regenerate")
async def regenerate_program(
    equipment_id: str,
    request: RegenerateProgramRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.regenerate_program(equipment_id, request, current_user=current_user)


@router.post("/{equipment_id}/import-tasks")
async def import_tasks(
    equipment_id: str,
    request: ImportTasksRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.import_tasks(equipment_id, request, current_user=current_user)


@router.post("/{equipment_id}/ai-recommendations")
async def generate_ai_recommendations(
    equipment_id: str,
    request: AIRecommendationRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.generate_ai_recommendations(
        equipment_id, request, current_user=current_user
    )


@router.post("/{equipment_id}/ai-recommendations/accept")
async def accept_ai_recommendation(
    equipment_id: str,
    task: Dict[str, Any],
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.accept_ai_recommendation(
        equipment_id, task, current_user=current_user
    )


@router.patch("/{equipment_id}/status")
async def update_program_status(
    equipment_id: str,
    status: ProgramStatus,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.update_program_status(
        equipment_id, status, current_user=current_user
    )


@router.post("/{equipment_id}/approve")
async def approve_program(
    equipment_id: str,
    request: ApprovalRequest,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.approve_program(equipment_id, request, current_user=current_user)


@router.get("/{equipment_id}/version-history")
async def get_version_history(
    equipment_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_version_history(equipment_id, current_user)


@router.get("/{equipment_id}/audit-log")
async def get_audit_log(
    equipment_id: str,
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user),
):
    return await svc.get_audit_log(equipment_id, limit=limit, current_user=current_user)


@router.post("/bulk/generate")
async def bulk_generate_programs(
    equipment_ids: List[str],
    generate_from_strategy: bool = True,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.bulk_generate_programs(
        equipment_ids,
        generate_from_strategy=generate_from_strategy,
        current_user=current_user,
    )


@router.post("/bulk/regenerate")
async def bulk_regenerate_programs(
    equipment_type_id: str,
    preserve_overrides: bool = True,
    preserve_manual_tasks: bool = True,
    current_user: dict = Depends(_scheduler_write),
):
    return await svc.bulk_regenerate_programs(
        equipment_type_id,
        preserve_overrides=preserve_overrides,
        preserve_manual_tasks=preserve_manual_tasks,
        current_user=current_user,
    )
