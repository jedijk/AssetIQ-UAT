"""
Scheduled Task lifecycle: list, daily/weekly planner, update, complete, defer.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from database import db
from auth import get_current_user
from models.maintenance_scheduler import (
    MaintenanceHistory,
    TaskStatus,
    UpdateTaskStatusRequest,
    CompleteTaskRequest,
    DeferTaskRequest,
)
from ._shared import ensure_imported_pm_tasks_scheduled, scope_scheduled_tasks_query

router = APIRouter()


# Task types that are corrective/reactive — these are triggered on failure, not planned.
# They must never appear in scheduled-task views.
CORRECTIVE_TASK_TYPES = ("reactive", "corrective")


@router.get("/tasks")
async def get_scheduled_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    include_completed: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Get scheduled tasks with filtering."""
    await ensure_imported_pm_tasks_scheduled(equipment_type_id)

    query = {}

    if status:
        query["status"] = status
    elif not include_completed:
        query["status"] = {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}

    if priority:
        query["priority"] = priority
    if assigned_to:
        query["assigned_technician_id"] = assigned_to
    if from_date:
        query["due_date"] = {"$gte": from_date}
    if to_date:
        if "due_date" in query:
            query["due_date"]["$lte"] = to_date
        else:
            query["due_date"] = {"$lte": to_date}

    await scope_scheduled_tasks_query(query, equipment_type_id)

    tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)

    # Always exclude reactive/corrective tasks — they are triggered on failure
    tasks = [t for t in tasks if t.get("task_type") not in CORRECTIVE_TASK_TYPES]

    today = datetime.utcnow().date().isoformat()
    for task in tasks:
        task["is_overdue"] = (
            task.get("due_date", "") < today
            and task.get("status") not in ["completed", "cancelled"]
        )

    return {"tasks": tasks, "total": len(tasks)}


@router.get("/tasks/daily-planner")
async def get_daily_planner(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get tasks for daily planner view."""
    await ensure_imported_pm_tasks_scheduled()

    if not date:
        date = datetime.utcnow().date().isoformat()

    today = datetime.utcnow().date().isoformat()
    tomorrow = (datetime.utcnow().date() + timedelta(days=1)).isoformat()

    base_query = {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "task_type": {"$nin": list(CORRECTIVE_TASK_TYPES)},
    }
    await scope_scheduled_tasks_query(base_query, None)

    overdue_tasks = await db.scheduled_tasks.find({
        **base_query,
        "due_date": {"$lt": today},
    }, {"_id": 0}).sort("priority", -1).to_list(100)

    today_tasks = await db.scheduled_tasks.find({
        **base_query,
        "due_date": today,
    }, {"_id": 0}).sort("priority", -1).to_list(100)

    tomorrow_tasks = await db.scheduled_tasks.find({
        **base_query,
        "due_date": tomorrow,
    }, {"_id": 0}).sort("priority", -1).to_list(100)

    for task in overdue_tasks:
        task["is_overdue"] = True

    return {
        "date": date,
        "overdue": {"tasks": overdue_tasks, "count": len(overdue_tasks)},
        "today": {"tasks": today_tasks, "count": len(today_tasks)},
        "tomorrow": {"tasks": tomorrow_tasks, "count": len(tomorrow_tasks)},
    }


@router.get("/tasks/weekly-planner")
async def get_weekly_planner(
    start_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get tasks for weekly planner view."""
    await ensure_imported_pm_tasks_scheduled()

    if not start_date:
        today_date = datetime.utcnow().date()
        start = today_date - timedelta(days=today_date.weekday())
    else:
        start = datetime.fromisoformat(start_date).date()

    end = start + timedelta(days=6)

    task_query = {
        "planned_date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "task_type": {"$nin": list(CORRECTIVE_TASK_TYPES)},
    }
    await scope_scheduled_tasks_query(task_query, None)

    tasks = await db.scheduled_tasks.find(task_query, {"_id": 0}).to_list(500)

    days = {}
    for i in range(7):
        day = (start + timedelta(days=i)).isoformat()
        days[day] = {
            "date": day,
            "day_name": (start + timedelta(days=i)).strftime("%A"),
            "tasks": [],
            "total_hours": 0,
        }

    today = datetime.utcnow().date().isoformat()

    for task in tasks:
        planned = task.get("planned_date")
        if planned in days:
            task["is_overdue"] = task.get("due_date", "") < today
            days[planned]["tasks"].append(task)
            days[planned]["total_hours"] += task.get("estimated_hours", 1.0)

    technicians = await db.technician_capacity.find({"is_active": True}, {"_id": 0}).to_list(100)

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "days": list(days.values()),
        "technicians": technicians,
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    request: UpdateTaskStatusRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update a scheduled task."""
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = {"updated_at": datetime.utcnow().isoformat()}

    if request.status:
        update_data["status"] = request.status.value
        if request.status == TaskStatus.IN_PROGRESS:
            update_data["started_at"] = datetime.utcnow().isoformat()

    if request.assigned_technician_id is not None:
        update_data["assigned_technician_id"] = request.assigned_technician_id
        update_data["assigned_technician_name"] = request.assigned_technician_name

    if request.planned_date is not None:
        update_data["planned_date"] = request.planned_date

    if request.priority is not None:
        update_data["priority"] = request.priority.value

    if request.findings is not None:
        update_data["findings"] = request.findings

    if request.notes is not None:
        update_data["notes"] = request.notes

    if request.actual_hours is not None:
        update_data["actual_hours"] = request.actual_hours

    await db.scheduled_tasks.update_one(
        {"id": task_id},
        {"$set": update_data},
    )

    return {"message": "Task updated", "task_id": task_id}


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    request: CompleteTaskRequest,
    current_user: dict = Depends(get_current_user),
):
    """Complete a scheduled task."""
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    now = datetime.utcnow().isoformat()
    today = datetime.utcnow().date().isoformat()

    await db.scheduled_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": TaskStatus.COMPLETED.value,
            "completed_at": now,
            "actual_hours": request.actual_hours,
            "findings": request.findings,
            "notes": request.observations,
            "updated_at": now,
        }},
    )

    history = MaintenanceHistory(
        equipment_id=task.get("equipment_id"),
        equipment_name=task.get("equipment_name"),
        equipment_tag=task.get("equipment_tag"),
        task_name=task.get("task_name"),
        task_type=task.get("task_type"),
        scheduled_task_id=task_id,
        maintenance_program_id=task.get("maintenance_program_id"),
        completion_date=today,
        technician_id=task.get("assigned_technician_id"),
        technician_name=task.get("assigned_technician_name"),
        actual_hours=request.actual_hours,
        findings=request.findings,
        observations=request.observations,
        failure_observed=request.failure_observed,
        strategy_id=task.get("strategy_id"),
        strategy_version=task.get("strategy_version"),
        failure_mode_id=task.get("failure_mode_id"),
    )

    await db.maintenance_history.insert_one(history.model_dump())

    program = await db.maintenance_programs.find_one({
        "id": task.get("maintenance_program_id")
    })

    next_due = None
    if program:
        freq_days = program.get("frequency_days", 30)
        next_due = (datetime.utcnow().date() + timedelta(days=freq_days)).isoformat()

        await db.maintenance_programs.update_one(
            {"id": program["id"]},
            {"$set": {
                "last_completion_date": today,
                "next_due_date": next_due,
                "updated_at": now,
            }},
        )

        # Auto-generate the next scheduled occurrence(s) so the calendar is
        # always populated without needing a manual "Run Scheduler" click.
        from routes.maintenance_scheduler.scheduler import schedule_program
        # Refetch the program so it carries the freshly-updated next_due_date.
        refreshed = await db.maintenance_programs.find_one({"id": program["id"]})
        if refreshed:
            await schedule_program(refreshed)

    return {
        "message": "Task completed",
        "task_id": task_id,
        "next_due_date": next_due,
    }


@router.post("/tasks/{task_id}/defer")
async def defer_task(
    task_id: str,
    request: DeferTaskRequest,
    current_user: dict = Depends(get_current_user),
):
    """Defer a scheduled task."""
    task = await db.scheduled_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.scheduled_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": TaskStatus.DEFERRED.value,
            "due_date": request.new_due_date,
            "planned_date": request.new_due_date,
            "notes": f"Deferred: {request.reason}",
            "updated_at": datetime.utcnow().isoformat(),
        }},
    )

    return {
        "message": "Task deferred",
        "task_id": task_id,
        "new_due_date": request.new_due_date,
    }
