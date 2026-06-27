"""
Scheduler Engine: turns active maintenance programs into ScheduledTasks
within the planning horizon.
"""
from fastapi import APIRouter, BackgroundTasks, Depends

from auth import require_permission
from models.maintenance_scheduler import (
    RunSchedulerRequest,
    CleanupOrphansRequest,
)
from services.background_jobs import background_job_service, JobStatus, tenant_id_from_user
from services.maintenance_scheduling import (
    DEFAULT_HORIZON_DAYS,
    schedule_program,
    schedule_programs_for_equipment,
    schedule_programs_for_equipment_type,
)
from services.worker_config import use_external_background_worker

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
        user=current_user,
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
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("scheduler:write")),
    request: RunSchedulerRequest = None,
):
    """
    Run the scheduler engine to generate scheduled tasks.
    Reviews all active maintenance programs and creates tasks within planning horizon.

    Defaults to a background job (run_async=true) to avoid gateway timeouts on
    large equipment types. Poll GET /maintenance-scheduler/jobs/{job_id} for status.
    """
    if request is None:
        request = RunSchedulerRequest()

    from services.maintenance_scheduler_run import run_scheduler_impl

    if request.run_async:
        user_id = current_user.get("id") or current_user.get("user_id")
        tenant_id = tenant_id_from_user(current_user)
        job_payload = {
            "equipment_type_id": request.equipment_type_id,
            "planning_horizon_days": request.planning_horizon_days,
        }
        if use_external_background_worker():
            job_id = await background_job_service.enqueue_for_external_worker(
                "run_scheduler",
                user_id=user_id,
                payload=job_payload,
                max_retries=1,
                tenant_id=tenant_id,
            )
        else:
            job_id = await background_job_service.schedule_returning_job_id(
                background_tasks,
                "run_scheduler",
                run_scheduler_impl,
                request,
                current_user,
                user_id=user_id,
                payload=job_payload,
                max_retries=1,
                tenant_id=tenant_id,
            )
        return {
            "status": JobStatus.PENDING.value,
            "job_id": job_id,
            "message": "Scheduler run queued",
            "equipment_type_id": request.equipment_type_id,
            "worker_mode": "external" if use_external_background_worker() else "in_process",
        }

    return await run_scheduler_impl(request, current_user)
