"""Apply equipment-type strategy to selected equipment (service layer)."""
import asyncio
import logging
import time

from fastapi import HTTPException

from database import db
from models.maintenance_scheduler import ApplyStrategyRequest
from services.maintenance_scheduler_sync import refresh_equipment_schedule
from services.maintenance_tenant_scope import maintenance_scoped
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

async def apply_strategy_to_equipment(
    equipment_type_id: str,
    request: ApplyStrategyRequest,
    current_user: dict,
):
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id})
    )

    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if strategy.get("status") != "active":
        raise HTTPException(status_code=400, detail="Strategy must be active to apply")

    equipment_list = await db.equipment_nodes.find(
        maintenance_scoped(current_user, {
            "id": {"$in": request.equipment_ids},
            "equipment_type_id": equipment_type_id,
        }),
    ).to_list(500)

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
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
        {"_id": 0, "id": 1},
    ).to_list(2000)
    all_type_equipment_ids = {e.get("id") for e in all_type_equipment if e.get("id")}
    deselected_equipment_ids = list(all_type_equipment_ids - set(equipment_ids))

    deselected_scheduled_tasks_removed = 0
    deselected_programs_removed = 0
    deselected_v2_programs_removed = 0
    if deselected_equipment_ids:
        sched_del = await db.scheduled_tasks.delete_many(
            maintenance_scoped(current_user, {
                "equipment_id": {"$in": deselected_equipment_ids},
                "equipment_type_id": equipment_type_id,
            })
        )
        deselected_scheduled_tasks_removed = sched_del.deleted_count

        prog_del = await db.maintenance_programs.delete_many(
            maintenance_scoped(current_user, {
                "equipment_id": {"$in": deselected_equipment_ids},
                "equipment_type_id": equipment_type_id,
            })
        )
        deselected_programs_removed = prog_del.deleted_count

        v2_del = await db.maintenance_programs_v2.delete_many(
            maintenance_scoped(current_user, {
                "equipment_id": {"$in": deselected_equipment_ids},
                "equipment_type_id": equipment_type_id,
            })
        )
        deselected_v2_programs_removed = v2_del.deleted_count

    from services.maintenance_program_service import MaintenanceProgramService

    t0 = time.perf_counter()
    v2_sync = await MaintenanceProgramService.ensure_programs_for_equipment_ids(
        equipment_ids=equipment_ids,
        strategy_version=strategy_version,
        user_id=user_id,
        tenant_id=tenant_id_from_user(current_user),
    )
    t_v2 = time.perf_counter() - t0
    v2_programs_created = v2_sync.get("programs_created", 0)
    v2_programs_regenerated = v2_sync.get("programs_regenerated", 0)
    v2_errors = v2_sync.get("errors", [])

    scheduled_count = 0
    programs_created_count = 0
    pm_import_synced = 0

    from services.strategy_propagation import resync_programs_with_strategy
    t1 = time.perf_counter()
    resync = await resync_programs_with_strategy(equipment_type_id)
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
    from services.maintenance_scheduling import schedule_programs_for_equipment
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

    from services.strategy_apply_state import clear_strategy_needs_apply

    await clear_strategy_needs_apply(
        equipment_type_id,
        applied_version=strategy_version,
    )

    from services.reliability_graph import (
        dispatch_graph_sync,
        graph_sync_async_enabled,
        sync_edges_for_apply_strategy,
    )

    tid = tenant_id_from_user(current_user)
    graph_kwargs = {
        "equipment_type_id": equipment_type_id,
        "equipment_ids": equipment_ids,
        "strategy_version": strategy_version,
        "tenant_id": tid,
    }
    if graph_sync_async_enabled():
        await dispatch_graph_sync(
            "sync_edges_for_apply_strategy",
            f"apply_strategy_{equipment_type_id}",
            **graph_kwargs,
        )
        graph_sync = {"edges_upserted": 0, "edges_retired": 0}
    else:
        graph_sync = await sync_edges_for_apply_strategy(**graph_kwargs)

    # Legacy flat-row count is 0 when SYNC_LEGACY_MAINTENANCE_PROGRAMS is off; surface v2 creates.
    effective_programs_created = programs_created_count or v2_programs_created

    return {
        "message": f"Strategy applied to {len(equipment_list)} equipment",
        "equipment_count": len(equipment_list),
        "programs_created": effective_programs_created,
        "programs_updated": len(equipment_list) * active_task_count - effective_programs_created,
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


