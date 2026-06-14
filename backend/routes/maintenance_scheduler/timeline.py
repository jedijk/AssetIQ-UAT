"""
Timeline view: scheduled tasks grouped per equipment within a date window.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from typing import Optional

from database import db
from auth import require_permission
from models.maintenance_scheduler import TaskStatus
from ._shared import ensure_imported_pm_tasks_scheduled, scope_scheduled_tasks_query

router = APIRouter()


@router.get("/timeline")
async def get_timeline(
    equipment_type_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_permission("scheduler:read")),
):
    """Get timeline view of scheduled tasks grouped by equipment."""
    await ensure_imported_pm_tasks_scheduled(equipment_type_id, read_only=True)

    if not start_date:
        start_date = datetime.utcnow().date().isoformat()
    if not end_date:
        end_date = (datetime.utcnow().date() + timedelta(days=90)).isoformat()

    query = {
        "due_date": {"$gte": start_date, "$lte": end_date},
        "status": {"$nin": [TaskStatus.CANCELLED.value]},
        "task_type": {"$nin": ["reactive", "corrective"]},
    }

    await scope_scheduled_tasks_query(query, equipment_type_id)

    tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)

    equipment_timeline = {}
    today = datetime.utcnow().date().isoformat()

    for task in tasks:
        equip_id = task.get("equipment_id")
        if equip_id not in equipment_timeline:
            equipment_timeline[equip_id] = {
                "equipment_id": equip_id,
                "equipment_name": task.get("equipment_name"),
                "equipment_tag": task.get("equipment_tag"),
                "tasks": [],
            }

        task["is_overdue"] = (
            task.get("due_date", "") < today and task.get("status") != "completed"
        )
        equipment_timeline[equip_id]["tasks"].append(task)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "timeline": list(equipment_timeline.values()),
        "total_tasks": len(tasks),
    }
