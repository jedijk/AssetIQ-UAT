"""
Scheduler Engine: turns active maintenance programs into ScheduledTasks
within the planning horizon.
"""
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends

from database import db
from auth import get_current_user
from models.maintenance_scheduler import (
    ScheduledTask,
    TaskStatus,
    RunSchedulerRequest,
)
from ._shared import calculate_priority

router = APIRouter()

# Default 1-year horizon so quarterly/semi-annual tasks show 4+ occurrences
# on the Gantt. Per-program cap prevents daily/weekly tasks from exploding.
DEFAULT_HORIZON_DAYS = 365
MAX_OCCURRENCES_PER_PROGRAM = 52


async def schedule_program(program: dict, horizon_days: int = DEFAULT_HORIZON_DAYS) -> List[str]:
    """
    Generate ScheduledTask occurrences for a single maintenance program
    within the planning horizon. Idempotent: skips dates that already exist.

    Returns the list of newly-created task ids.
    """
    # Belt-and-suspenders: skip CM/reactive programs even if they exist
    if program.get("task_type") in ("reactive", "corrective"):
        return []
    if not program.get("is_active", True):
        return []

    today = datetime.utcnow().date()
    today_str = today.isoformat()
    program_id = program.get("id")
    criticality = program.get("criticality") or "low"
    horizon_date_obj = today + timedelta(days=horizon_days)
    freq_days = max(1, int(program.get("frequency_days") or 30))

    next_due_str = program.get("next_due_date") or today_str
    try:
        current_due = datetime.fromisoformat(next_due_str).date()
    except (TypeError, ValueError):
        current_due = today

    created_ids: List[str] = []
    occurrences = 0
    last_created_iso: Optional[str] = None
    while current_due <= horizon_date_obj and occurrences < MAX_OCCURRENCES_PER_PROGRAM:
        iso = current_due.isoformat()
        existing_task = await db.scheduled_tasks.find_one({
            "maintenance_program_id": program_id,
            "due_date": iso,
            "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        })
        if not existing_task:
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
                task_source=program.get("task_source"),
                pm_import_task_id=program.get("pm_import_task_id"),
            )
            await db.scheduled_tasks.insert_one(task.model_dump())
            created_ids.append(task.id)
            last_created_iso = iso

        occurrences += 1
        current_due = current_due + timedelta(days=freq_days)

    if last_created_iso:
        await db.maintenance_programs.update_one(
            {"id": program_id},
            {"$set": {"last_scheduled_date": today_str}},
        )

    return created_ids


async def schedule_programs_for_equipment_type(equipment_type_id: str, horizon_days: int = DEFAULT_HORIZON_DAYS) -> int:
    """Generate scheduled tasks for all active programs of a given equipment type."""
    total = 0
    cursor = db.maintenance_programs.find({"equipment_type_id": equipment_type_id, "is_active": True})
    async for program in cursor:
        created = await schedule_program(program, horizon_days)
        total += len(created)
    return total


async def schedule_programs_for_equipment(equipment_ids: List[str], horizon_days: int = DEFAULT_HORIZON_DAYS) -> int:
    """Generate scheduled tasks for all active programs of given equipment ids."""
    if not equipment_ids:
        return 0
    total = 0
    cursor = db.maintenance_programs.find({"equipment_id": {"$in": equipment_ids}, "is_active": True})
    async for program in cursor:
        created = await schedule_program(program, horizon_days)
        total += len(created)
    return total


@router.post("/cleanup-orphans")
async def cleanup_orphan_scheduled_tasks(
    current_user: dict = Depends(get_current_user),
):
    """
    Remove scheduled_tasks whose maintenance_program no longer exists,
    AND maintenance_programs whose equipment_type has no strategy.
    Used to clean up data left over from older deletes that did not cascade.
    """
    # Step 1: existing programs (keep these and their tasks)
    all_prog_ids = set()
    async for p in db.maintenance_programs.find({}, {"id": 1}):
        all_prog_ids.add(p["id"])

    sched_res = await db.scheduled_tasks.delete_many({
        "maintenance_program_id": {"$nin": list(all_prog_ids), "$ne": None},
    })

    # Step 2: programs whose equipment_type has no strategy
    existing_strategy_eq_types = set()
    async for s in db.equipment_type_strategies.find({}, {"equipment_type_id": 1}):
        existing_strategy_eq_types.add(s["equipment_type_id"])

    orphan_programs = []
    async for prog in db.maintenance_programs.find({}, {"id": 1, "equipment_type_id": 1}):
        et_id = prog.get("equipment_type_id")
        if et_id and et_id not in existing_strategy_eq_types:
            orphan_programs.append(prog["id"])

    extra_sched_deleted = 0
    if orphan_programs:
        extra = await db.scheduled_tasks.delete_many(
            {"maintenance_program_id": {"$in": orphan_programs}}
        )
        extra_sched_deleted = extra.deleted_count
    prog_res = await db.maintenance_programs.delete_many({"id": {"$in": orphan_programs}})

    return {
        "scheduled_tasks_removed": sched_res.deleted_count + extra_sched_deleted,
        "programs_removed": prog_res.deleted_count,
    }


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

    from services.maintenance_program_service import MaintenanceProgramService

    await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
        equipment_type_id=request.equipment_type_id,
        schedule=False,
    )

    query = {"is_active": True}
    if request.equipment_type_id:
        query["equipment_type_id"] = request.equipment_type_id

    programs = await db.maintenance_programs.find(query).to_list(5000)

    tasks_created = []
    horizon = request.planning_horizon_days or DEFAULT_HORIZON_DAYS
    for program in programs:
        created_ids = await schedule_program(program, horizon)
        tasks_created.extend(created_ids)

    return {
        "message": "Scheduler run completed",
        "tasks_created": len(tasks_created),
        "programs_reviewed": len(programs),
    }
