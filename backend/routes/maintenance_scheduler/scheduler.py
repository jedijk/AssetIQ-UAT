"""
Scheduler Engine: turns active maintenance programs into ScheduledTasks
within the planning horizon.
"""
from fastapi import APIRouter, Depends

from auth import require_permission
from models.maintenance_scheduler import (
    RunSchedulerRequest,
    CleanupOrphansRequest,
)
from services.maintenance_scheduling import (
    DEFAULT_HORIZON_DAYS,
    schedule_program,
    schedule_programs_for_equipment,
    schedule_programs_for_equipment_type,
)

router = APIRouter()

# Re-export for route modules that still import from scheduler.
__all__ = [
    "DEFAULT_HORIZON_DAYS",
    "schedule_program",
    "schedule_programs_for_equipment",
    "schedule_programs_for_equipment_type",
]


@router.post("/cleanup-orphans")
async def cleanup_orphan_scheduled_tasks(
    request: CleanupOrphansRequest = None,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """
    Remove stale strategy schedule items, scheduled_tasks whose maintenance_program
    no longer exists, and maintenance_programs whose equipment_type has no strategy.
    Optionally scoped to a single equipment type.
    """
    from services.maintenance_scheduler_sync import cleanup_schedules_without_strategy

    if request is None:
        request = CleanupOrphansRequest()

    strategy_cleanup = await cleanup_schedules_without_strategy(
        equipment_type_id=request.equipment_type_id,
    )

    return {
        "message": "Schedule cleanup completed",
        "equipment_type_id": request.equipment_type_id,
        "scheduled_tasks_removed": strategy_cleanup.get("scheduled_tasks_deleted", 0),
        "programs_removed": strategy_cleanup.get("programs_deleted", 0),
        "v2_programs_removed": strategy_cleanup.get("v2_programs_deleted", 0),
        "equipment_types_cleaned": strategy_cleanup.get("equipment_types_cleaned", 0),
        "strategy_cleanup": strategy_cleanup,
    }


@router.post("/run-scheduler")
async def run_scheduler(
    request: RunSchedulerRequest = None,
    current_user: dict = Depends(require_permission("scheduler:write")),
):
    """
    Run the scheduler engine to generate scheduled tasks.
    Reviews all active maintenance programs and creates tasks within planning horizon.
    """
    if request is None:
        request = RunSchedulerRequest()

    from services.maintenance_program_service import MaintenanceProgramService
    from services.maintenance_scheduler_sync import cleanup_schedules_without_strategy
    from services.scheduler_program_source import load_schedulable_programs

    strategy_cleanup = await cleanup_schedules_without_strategy(
        equipment_type_id=request.equipment_type_id,
    )

    await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
        equipment_type_id=request.equipment_type_id,
        schedule=False,
    )

    schedulable_programs = await load_schedulable_programs(
        equipment_type_id=request.equipment_type_id,
    )
    programs_skipped = 0

    tasks_created = []
    horizon = request.planning_horizon_days or DEFAULT_HORIZON_DAYS
    for program in schedulable_programs:
        created_ids = await schedule_program(program, horizon)
        tasks_created.extend(created_ids)

    return {
        "message": "Scheduler run completed",
        "tasks_created": len(tasks_created),
        "programs_reviewed": len(schedulable_programs),
        "programs_skipped_no_strategy": programs_skipped,
        "strategy_cleanup": strategy_cleanup,
    }
