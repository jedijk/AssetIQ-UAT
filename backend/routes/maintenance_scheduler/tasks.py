"""
Scheduled Task lifecycle: list, daily/weekly planner, update, complete, defer.
"""
from fastapi import APIRouter, Depends
from typing import Optional

from auth import require_permission
from models.maintenance_scheduler import (
    UpdateTaskStatusRequest,
    CompleteTaskRequest,
    DeferTaskRequest,
)
from services import maintenance_scheduler_service as svc

router = APIRouter()

_scheduler_read = require_permission("scheduler:read")

# Re-export for tests and other scheduler modules.
CORRECTIVE_TASK_TYPES = svc.CORRECTIVE_TASK_TYPES


@router.get("/tasks")
async def get_scheduled_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    include_completed: bool = False,
    current_user: dict = Depends(_scheduler_read),
):
    """Get scheduled tasks with filtering."""
    return await svc.list_scheduled_tasks(
        current_user,
        status=status,
        priority=priority,
        equipment_type_id=equipment_type_id,
        assigned_to=assigned_to,
        from_date=from_date,
        to_date=to_date,
        include_completed=include_completed,
    )


@router.get("/tasks/daily-planner")
async def get_daily_planner(
    date: Optional[str] = None,
    current_user: dict = Depends(_scheduler_read),
):
    """Get tasks for daily planner view."""
    return await svc.get_daily_planner(current_user, date=date)


@router.get("/tasks/weekly-planner")
async def get_weekly_planner(
    start_date: Optional[str] = None,
    current_user: dict = Depends(_scheduler_read),
):
    """Get tasks for weekly planner view."""
    return await svc.get_weekly_planner(current_user, start_date=start_date)


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    request: UpdateTaskStatusRequest,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """Update a scheduled task."""
    return await svc.update_scheduled_task(current_user, task_id, request)


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    request: CompleteTaskRequest,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """Complete a scheduled task."""
    return await svc.complete_scheduled_task(current_user, task_id, request)


@router.post("/tasks/{task_id}/defer")
async def defer_task(
    task_id: str,
    request: DeferTaskRequest,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """Defer a scheduled task."""
    return await svc.defer_scheduled_task(current_user, task_id, request)
