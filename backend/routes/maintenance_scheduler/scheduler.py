"""
Scheduler Engine: turns active maintenance programs into ScheduledTasks
within the planning horizon.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends

from database import db
from auth import get_current_user
from models.maintenance_scheduler import (
    ScheduledTask,
    TaskStatus,
    RunSchedulerRequest,
)
from ._shared import get_planning_horizon, calculate_priority

router = APIRouter()


@router.post("/run-scheduler")
async def run_scheduler(
    request: RunSchedulerRequest = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Run the scheduler engine to generate scheduled tasks.
    Reviews all active maintenance programs and creates tasks within planning horizon.
    """
    if request is None:
        request = RunSchedulerRequest()

    today = datetime.utcnow().date()
    today_str = today.isoformat()

    query = {"is_active": True}
    if request.equipment_type_id:
        query["equipment_type_id"] = request.equipment_type_id

    programs = await db.maintenance_programs.find(query).to_list(5000)

    tasks_created = []
    tasks_skipped = 0

    for program in programs:
        program_id = program.get("id")
        criticality = program.get("criticality", "medium")

        horizon = request.planning_horizon_days or get_planning_horizon(criticality)
        horizon_date = (today + timedelta(days=horizon)).isoformat()

        next_due = program.get("next_due_date") or today_str

        if next_due > horizon_date:
            tasks_skipped += 1
            continue

        existing_task = await db.scheduled_tasks.find_one({
            "maintenance_program_id": program_id,
            "due_date": next_due,
            "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        })

        if existing_task:
            tasks_skipped += 1
            continue

        due_date = datetime.fromisoformat(next_due).date()
        days_until_due = (due_date - today).days
        is_overdue = days_until_due < 0
        priority = calculate_priority(criticality, days_until_due, is_overdue)

        task = ScheduledTask(
            equipment_id=program.get("equipment_id"),
            equipment_name=program.get("equipment_name"),
            equipment_tag=program.get("equipment_tag"),
            task_name=program.get("task_name"),
            task_description=program.get("task_description"),
            task_type=program.get("task_type"),
            due_date=next_due,
            planned_date=next_due,
            priority=priority,
            status=TaskStatus.SCHEDULED,
            estimated_hours=program.get("estimated_duration_hours", 1.0),
            maintenance_program_id=program_id,
            strategy_id=program.get("strategy_id"),
            strategy_version=program.get("strategy_version"),
            failure_mode_id=program.get("failure_mode_id"),
            failure_mode_name=program.get("failure_mode_name"),
        )

        await db.scheduled_tasks.insert_one(task.model_dump())
        tasks_created.append(task.id)

        await db.maintenance_programs.update_one(
            {"id": program_id},
            {"$set": {"last_scheduled_date": today_str}},
        )

    return {
        "message": "Scheduler run completed",
        "tasks_created": len(tasks_created),
        "tasks_skipped": tasks_skipped,
        "programs_reviewed": len(programs),
    }
