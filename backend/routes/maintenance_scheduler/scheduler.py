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

    # Default 90-day horizon so the timeline shows recurring occurrences.
    # Cap occurrences per program so a daily/weekly task doesn't explode.
    DEFAULT_HORIZON_DAYS = 90
    MAX_OCCURRENCES_PER_PROGRAM = 60

    for program in programs:
        program_id = program.get("id")

        # Belt-and-suspenders: skip CM/reactive programs even if they exist
        if program.get("task_type") in ("reactive", "corrective"):
            tasks_skipped += 1
            continue

        criticality = program.get("criticality") or "low"

        horizon = request.planning_horizon_days or DEFAULT_HORIZON_DAYS
        horizon_date_obj = today + timedelta(days=horizon)

        freq_days = max(1, int(program.get("frequency_days") or 30))

        next_due_str = program.get("next_due_date") or today_str
        try:
            current_due = datetime.fromisoformat(next_due_str).date()
        except (TypeError, ValueError):
            current_due = today

        occurrences = 0
        last_created_iso = None
        while current_due <= horizon_date_obj and occurrences < MAX_OCCURRENCES_PER_PROGRAM:
            iso = current_due.isoformat()

            existing_task = await db.scheduled_tasks.find_one({
                "maintenance_program_id": program_id,
                "due_date": iso,
                "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
            })

            if existing_task:
                tasks_skipped += 1
            else:
                days_until_due = (current_due - today).days
                is_overdue = days_until_due < 0
                priority = calculate_priority(criticality, days_until_due, is_overdue)

                task = ScheduledTask(
                    equipment_id=program.get("equipment_id"),
                    equipment_name=program.get("equipment_name"),
                    equipment_tag=program.get("equipment_tag"),
                    task_name=program.get("task_name"),
                    task_description=program.get("task_description"),
                    task_type=program.get("task_type"),
                    due_date=iso,
                    planned_date=iso,
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
                last_created_iso = iso

            occurrences += 1
            current_due = current_due + timedelta(days=freq_days)

        if last_created_iso:
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
