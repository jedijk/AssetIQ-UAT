"""
Unified work-items API — task_instances, unbridged scheduled_tasks, and actions.

Same serialization as My Tasks via ``work_item_query.fetch_work_items``.
Legacy ``/my-tasks/*`` routes remain as deprecated aliases.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Body

from auth import require_permission
from routes import my_tasks as my_tasks_routes
from services.work_item_projection import get_projected_work_items, invalidate_user_projections
from services.work_item_query import (
    fetch_unbridged_maintenance_work_items,
    fetch_work_items,
)

_tasks_read = require_permission("tasks:read")
_tasks_write = require_permission("tasks:write")

router = APIRouter(prefix="/work-items", tags=["Work Items"])


@router.get("")
async def list_work_items(
    filter: str = Query("open", description="open | today | overdue | recurring | adhoc | all"),
    date: Optional[str] = Query(None, description="Date for filtering (YYYY-MM-DD)"),
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    discipline: Optional[str] = None,
    refresh: bool = Query(False, description="Bypass projection cache"),
    current_user: dict = Depends(_tasks_read),
):
    """Unified work-item list for My Tasks and scheduler views."""
    user_id = current_user.get("id") or ""
    result = await get_projected_work_items(
        user_id,
        filter_name=filter,
        date=date,
        equipment_id=equipment_id,
        status=status,
        discipline=discipline,
        user=current_user,
        force_refresh=refresh,
    )
    return result


@router.get("/maintenance/unbridged")
async def list_unbridged_maintenance_work_items(
    filter: str = Query("open", description="open | today | overdue | all"),
    equipment_id: Optional[str] = None,
    discipline: Optional[str] = None,
    current_user: dict = Depends(_tasks_read),
):
    """Open scheduled maintenance tasks without a task_instance row yet."""
    user_id = current_user.get("id") or ""
    items = await fetch_unbridged_maintenance_work_items(
        user_id,
        filter_name=filter,
        equipment_id=equipment_id,
        discipline=discipline,
    )
    return {"items": items, "count": len(items)}


@router.get("/adhoc-plans")
async def list_adhoc_plans(current_user: dict = Depends(_tasks_read)):
    return await my_tasks_routes.get_adhoc_plans(current_user=current_user)


@router.post("/adhoc-plans/{plan_id}/execute")
async def execute_adhoc_plan(
    plan_id: str,
    current_user: dict = Depends(_tasks_write),
):
    result = await my_tasks_routes.execute_adhoc_plan(plan_id, current_user=current_user)
    await invalidate_user_projections(current_user.get("id") or "")
    return result


@router.get("/{task_id}")
async def get_work_item_detail(
    task_id: str,
    current_user: dict = Depends(_tasks_read),
):
    return await my_tasks_routes.get_my_task_detail(task_id, current_user=current_user)


@router.post("/{task_id}/start")
async def start_work_item(
    task_id: str,
    current_user: dict = Depends(_tasks_write),
):
    result = await my_tasks_routes.start_my_task(task_id, current_user=current_user)
    await invalidate_user_projections(current_user.get("id") or "")
    return result


@router.post("/actions/{action_id}/start")
async def start_work_item_action(
    action_id: str,
    current_user: dict = Depends(_tasks_write),
):
    result = await my_tasks_routes.start_my_action(action_id, current_user=current_user)
    await invalidate_user_projections(current_user.get("id") or "")
    return result


@router.post("/actions/{action_id}/complete")
async def complete_work_item_action(
    action_id: str,
    data: Optional[dict] = Body(default=None),
    current_user: dict = Depends(_tasks_write),
):
    result = await my_tasks_routes.complete_my_action(
        action_id, data=data, current_user=current_user
    )
    await invalidate_user_projections(current_user.get("id") or "")
    return result
