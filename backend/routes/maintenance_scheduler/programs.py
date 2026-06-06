"""
Equipment Maintenance Programs:
- Apply maintenance strategy to selected equipment
- List programs (with filters)
- Programs summary per equipment type
"""
import asyncio
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import Optional

from database import db

logger = logging.getLogger(__name__)
from auth import get_current_user, require_permission
from models.maintenance_scheduler import ApplyStrategyRequest
from services.maintenance_scheduler_sync import refresh_equipment_schedule
from services.background_jobs import background_job_service, JobStatus

router = APIRouter()

_library_write = require_permission("library:write")

APPLY_STRATEGY_ASYNC_THRESHOLD = 5


@router.get("/jobs/{job_id}")
async def get_scheduler_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Poll status of a maintenance scheduler background job."""
    job = await background_job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("user_id") and job["user_id"] != (
        current_user.get("id") or current_user.get("user_id")
    ):
        role = current_user.get("role")
        if role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Not allowed to view this job")
    return job


@router.post("/apply-strategy/{equipment_type_id}")
async def apply_strategy_to_equipment(
    equipment_type_id: str,
    request: ApplyStrategyRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_library_write),
):
    """
    Apply maintenance strategy to selected equipment.
    Creates maintenance program records for each equipment-task combination.

    For large batches (>=5 equipment) or when run_async=true, returns immediately
    with a job_id to poll via GET /maintenance-scheduler/jobs/{job_id}.
    """
    use_async = request.run_async or len(request.equipment_ids) >= APPLY_STRATEGY_ASYNC_THRESHOLD
    if use_async:
        user_id = current_user.get("id") or current_user.get("user_id")
        job_id = await background_job_service.schedule_returning_job_id(
            background_tasks,
            "apply_strategy",
            _apply_strategy_to_equipment_impl,
            equipment_type_id,
            request,
            current_user,
            user_id=user_id,
            payload={
                "equipment_type_id": equipment_type_id,
                "equipment_count": len(request.equipment_ids),
            },
            max_retries=1,
        )
        return {
            "status": JobStatus.PENDING.value,
            "job_id": job_id,
            "message": "Apply strategy queued",
            "equipment_count": len(request.equipment_ids),
        }

    try:
        return await _apply_strategy_to_equipment_impl(
            equipment_type_id, request, current_user
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "apply_strategy failed for equipment_type_id=%s", equipment_type_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply strategy: {exc}",
        ) from exc


async def _apply_strategy_to_equipment_impl(
    equipment_type_id: str,
    request: ApplyStrategyRequest,
    current_user: dict,
):
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if strategy.get("status") != "active":
        raise HTTPException(status_code=400, detail="Strategy must be active to apply")

    equipment_list = await db.equipment_nodes.find({
        "id": {"$in": request.equipment_ids},
        "equipment_type_id": equipment_type_id,
    }).to_list(500)

    if not equipment_list:
        raise HTTPException(status_code=404, detail="No matching equipment found")

    user_id = current_user.get("id") or current_user.get("user_id")
    strategy_version = strategy.get("version", "1.0")
    equipment_ids = [e.get("id") for e in equipment_list if e.get("id")]

    # ----- Cleanup: remove programs & scheduled tasks for DESELECTED equipment -----
    # Any equipment of this equipment_type that is NOT in the current selection
    # should have its previously-generated maintenance programs and scheduled tasks
    # removed so the dialog acts as the single source of truth for strategy coverage.
    all_type_equipment = await db.equipment_nodes.find(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0, "id": 1},
    ).to_list(2000)
    all_type_equipment_ids = {e.get("id") for e in all_type_equipment if e.get("id")}
    deselected_equipment_ids = list(all_type_equipment_ids - set(equipment_ids))

    deselected_scheduled_tasks_removed = 0
    deselected_programs_removed = 0
    deselected_v2_programs_removed = 0
    if deselected_equipment_ids:
        sched_del = await db.scheduled_tasks.delete_many({
            "equipment_id": {"$in": deselected_equipment_ids},
            "equipment_type_id": equipment_type_id,
        })
        deselected_scheduled_tasks_removed = sched_del.deleted_count

        prog_del = await db.maintenance_programs.delete_many({
            "equipment_id": {"$in": deselected_equipment_ids},
            "equipment_type_id": equipment_type_id,
        })
        deselected_programs_removed = prog_del.deleted_count

        v2_del = await db.maintenance_programs_v2.delete_many({
            "equipment_id": {"$in": deselected_equipment_ids},
            "equipment_type_id": equipment_type_id,
        })
        deselected_v2_programs_removed = v2_del.deleted_count

    from services.maintenance_program_service import MaintenanceProgramService

    t0 = time.perf_counter()
    v2_sync = await MaintenanceProgramService.ensure_programs_for_equipment_ids(
        equipment_ids=equipment_ids,
        strategy_version=strategy_version,
        user_id=user_id,
    )
    t_v2 = time.perf_counter() - t0
    v2_programs_created = v2_sync.get("programs_created", 0)
    v2_programs_regenerated = v2_sync.get("programs_regenerated", 0)
    v2_errors = v2_sync.get("errors", [])

    scheduled_count = 0
    programs_created_count = 0
    pm_import_synced = 0

    from routes.maintenance_strategy_v2 import _resync_programs_with_strategy
    t1 = time.perf_counter()
    resync = await _resync_programs_with_strategy(equipment_type_id)
    t_resync = time.perf_counter() - t1

    # Parallelize the per-equipment refresh — each equipment's refresh_equipment_schedule
    # is an independent set of DB ops, so we fire them all concurrently with gather().
    # We also skip the heavy schedule_programs_for_equipment per equipment and call it
    # once in batch at the end. The strategy doc is reused across all calls.
    t2 = time.perf_counter()
    refresh_results = await asyncio.gather(
        *[
            refresh_equipment_schedule(
                equipment.get("id"),
                user_id=user_id,
                skip_scheduling=True,
                strategy=strategy,
            )
            for equipment in equipment_list
            if equipment.get("id")
        ]
    )
    t_refresh = time.perf_counter() - t2

    # Batched schedule generation — one find+iterate over ALL relevant programs
    # instead of N separate scans.
    t3 = time.perf_counter()
    from routes.maintenance_scheduler.scheduler import schedule_programs_for_equipment
    scheduled_count = await schedule_programs_for_equipment(equipment_ids)
    t_schedule = time.perf_counter() - t3

    for refresh in refresh_results:
        programs_created_count += refresh.get("strategy_programs_created", 0)
        pm_import_synced += refresh.get("pm_import_programs_synced", 0)
        resync["programs_deactivated"] += refresh.get("strategy_programs_deactivated", 0)

    from services.scheduler_helpers import build_task_to_failure_modes, is_strategy_task_active
    task_to_fms = build_task_to_failure_modes(strategy)
    active_task_count = sum(
        1
        for task in (strategy.get("task_templates") or [])
        if is_strategy_task_active(task, task_to_fms=task_to_fms)
    )

    logger.info(
        "apply_strategy timings type=%s eq=%d v2=%.2fs resync=%.2fs refresh(gather)=%.2fs schedule(batch)=%.2fs total=%.2fs",
        equipment_type_id,
        len(equipment_list),
        t_v2,
        t_resync,
        t_refresh,
        t_schedule,
        time.perf_counter() - t0,
    )

    from routes.maintenance_strategy_v2.strategy_helpers import clear_strategy_needs_apply

    await clear_strategy_needs_apply(
        equipment_type_id,
        applied_version=strategy_version,
    )

    from services.reliability_graph import sync_edges_for_apply_strategy

    graph_sync = await sync_edges_for_apply_strategy(
        equipment_type_id=equipment_type_id,
        equipment_ids=equipment_ids,
        strategy_version=strategy_version,
    )

    return {
        "message": f"Strategy applied to {len(equipment_list)} equipment",
        "equipment_count": len(equipment_list),
        "programs_created": programs_created_count,
        "programs_updated": len(equipment_list) * active_task_count - programs_created_count,
        "scheduled_tasks_created": scheduled_count,
        "programs_deactivated_on_resync": resync["programs_deactivated"],
        "equipment_manager_programs_created": v2_programs_created,
        "equipment_manager_programs_regenerated": v2_programs_regenerated,
        "equipment_manager_program_errors": v2_errors,
        "equipment_manager_equipment_ids": (
            v2_sync.get("equipment_ids_created", [])
            + v2_sync.get("equipment_ids_regenerated", [])
        ),
        "pm_import_programs_synced": pm_import_synced,
        "deselected_equipment_count": len(deselected_equipment_ids),
        "deselected_programs_removed": deselected_programs_removed,
        "deselected_v2_programs_removed": deselected_v2_programs_removed,
        "deselected_scheduled_tasks_removed": deselected_scheduled_tasks_removed,
        "reliability_edges_upserted": graph_sync.get("edges_upserted", 0),
    }


@router.get("/programs")
async def get_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    is_active: bool = True,
    current_user: dict = Depends(get_current_user),
):
    """Get schedulable maintenance program rows (canonical v2 source)."""
    from services.scheduler_program_source import load_schedulable_programs

    equipment_ids = [equipment_id] if equipment_id else None
    programs = await load_schedulable_programs(
        equipment_type_id=equipment_type_id,
        equipment_ids=equipment_ids,
    )
    if is_active:
        programs = [p for p in programs if p.get("is_active", True)]

    return {"programs": programs, "total": len(programs), "source": "v2"}


@router.get("/programs/{equipment_type_id}/summary")
async def get_programs_summary(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get summary of maintenance programs for an equipment type (v2)."""
    programs = await db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id, "status": {"$in": ["active", "draft"]}},
        {"_id": 0, "equipment_id": 1, "equipment_name": 1, "equipment_tag": 1, "tasks": 1},
    ).to_list(500)

    equipment_summary = []
    total_tasks = 0
    for prog in programs:
        active_tasks = [
            t for t in (prog.get("tasks") or [])
            if t.get("is_active", True)
        ]
        total_tasks += len(active_tasks)
        equipment_summary.append({
            "_id": prog.get("equipment_id"),
            "equipment_name": prog.get("equipment_name"),
            "equipment_tag": prog.get("equipment_tag"),
            "task_count": len(active_tasks),
        })

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_count": len(equipment_summary),
        "total_program_tasks": total_tasks,
        "equipment_summary": equipment_summary,
        "source": "maintenance_programs_v2",
    }
