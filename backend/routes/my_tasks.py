"""
My Tasks routes — orchestration only (Wave 8 convergence).
"""
from typing import Optional

from fastapi import APIRouter, Body, Depends, Query, Response

from auth import require_permission

router = APIRouter(tags=["My Tasks"])

_tasks_read = require_permission("tasks:read")
_tasks_write = require_permission("tasks:write")


def _apply_my_tasks_deprecation_headers(response: Response) -> None:
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "2026-09-01"
    response.headers["Link"] = '</api/work-items/>; rel="successor-version"'


@router.get("/my-tasks/kpis")
async def get_my_tasks_kpis(current_user: dict = Depends(_tasks_read)):
    from services import my_tasks_service

    return await my_tasks_service.get_my_tasks_kpis(current_user)


@router.get("/my-tasks")
async def get_my_tasks(
    response: Response,
    filter: str = Query("open", description="Filter: open, overdue, recurring, adhoc, all"),
    date: Optional[str] = Query(None, description="Date for filtering (YYYY-MM-DD)"),
    equipment_id: Optional[str] = Query(None, description="Filter by equipment"),
    status: Optional[str] = Query(None, description="Filter by status"),
    discipline: Optional[str] = Query(None, description="Filter by discipline (Mechanical, Electrical, etc.)"),
    current_user: dict = Depends(_tasks_read),
):
    """Get unified work items for the current user. Deprecated: use GET /work-items/."""
    _apply_my_tasks_deprecation_headers(response)
    from services import my_tasks_service

    return await my_tasks_service.list_my_tasks(
        current_user,
        filter_name=filter,
        date=date,
        equipment_id=equipment_id,
        status=status,
        discipline=discipline,
    )


@router.get("/my-tasks/{task_id}")
async def get_my_task_detail(task_id: str, current_user: dict = Depends(_tasks_read)):
    from services import my_tasks_service

    return await my_tasks_service.get_task_detail(current_user, task_id)


@router.post("/my-tasks/{task_id}/start")
async def start_my_task(task_id: str, current_user: dict = Depends(_tasks_write)):
    from services import my_tasks_service

    return await my_tasks_service.start_task(current_user, task_id)


@router.post("/my-tasks/action/{action_id}/complete")
async def complete_my_action(
    action_id: str,
    data: Optional[dict] = Body(default=None),
    current_user: dict = Depends(_tasks_write),
):
    from services import my_tasks_service

    return await my_tasks_service.complete_action(current_user, action_id, data)


@router.post("/my-tasks/action/{action_id}/start")
async def start_my_action(action_id: str, current_user: dict = Depends(_tasks_write)):
    from services import my_tasks_service

    return await my_tasks_service.start_action(current_user, action_id)


@router.get("/adhoc-plans")
async def get_adhoc_plans(current_user: dict = Depends(_tasks_read)):
    from services import my_tasks_service

    return await my_tasks_service.get_adhoc_plans(current_user)


@router.post("/adhoc-plans/{plan_id}/execute")
async def execute_adhoc_plan(plan_id: str, current_user: dict = Depends(_tasks_write)):
    from services import my_tasks_service

    return await my_tasks_service.execute_adhoc_plan(current_user, plan_id)
