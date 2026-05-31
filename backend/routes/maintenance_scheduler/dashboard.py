"""
Dashboard KPIs for the scheduler view.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from typing import Optional

from database import db
from auth import get_current_user
from models.maintenance_scheduler import TaskStatus

router = APIRouter()


@router.get("/dashboard")
async def get_scheduler_dashboard(
    equipment_type_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get scheduler dashboard KPIs."""
    today = datetime.utcnow().date().isoformat()
    week_end = (datetime.utcnow().date() + timedelta(days=7)).isoformat()

    base_query = {}
    if equipment_type_id:
        programs = await db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1},
        ).to_list(1000)
        program_ids = [p["id"] for p in programs]
        base_query["maintenance_program_id"] = {"$in": program_ids}

    open_query = {**base_query, "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}}
    overdue_query = {
        **base_query,
        "due_date": {"$lt": today},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
    }
    upcoming_query = {
        **base_query,
        "due_date": {"$gte": today, "$lte": week_end},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
    }

    open_count = await db.scheduled_tasks.count_documents(open_query)
    overdue_count = await db.scheduled_tasks.count_documents(overdue_query)
    upcoming_count = await db.scheduled_tasks.count_documents(upcoming_query)

    month_ago = (datetime.utcnow().date() - timedelta(days=30)).isoformat()
    completed_on_time = await db.scheduled_tasks.count_documents({
        **base_query,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": {"$gte": month_ago},
        "$expr": {"$lte": ["$completed_at", "$due_date"]},
    })

    total_completed = await db.scheduled_tasks.count_documents({
        **base_query,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": {"$gte": month_ago},
    })

    compliance_rate = (completed_on_time / total_completed * 100) if total_completed > 0 else 100

    priority_breakdown = await db.scheduled_tasks.aggregate([
        {"$match": open_query},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
    ]).to_list(10)

    return {
        "backlog": {
            "open_tasks": open_count,
            "overdue_tasks": overdue_count,
            "upcoming_tasks": upcoming_count,
        },
        "compliance": {
            "rate": round(compliance_rate, 1),
            "completed_on_time": completed_on_time,
            "total_completed": total_completed,
        },
        "priority_breakdown": {p["_id"]: p["count"] for p in priority_breakdown},
    }
