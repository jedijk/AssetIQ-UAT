"""
Unified work-items API — maintenance scheduled tasks not yet bridged to task_instances.

Complements My Tasks; same serialization as work_item_query.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import require_permission
from services.work_item_query import fetch_unbridged_maintenance_work_items

_tasks_read = require_permission("tasks:read")

router = APIRouter(prefix="/work-items", tags=["Work Items"])


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
