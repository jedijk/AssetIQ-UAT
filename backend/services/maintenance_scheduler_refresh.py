"""Refresh equipment and equipment-type maintenance schedules."""
import logging
from typing import Any, Dict, List, Optional, Set

from database import db
from services.maintenance_scheduler_shared import _active_strategy_type_ids
from services.maintenance_scheduler_strategy_sync import sync_strategy_programs_for_equipment
from services.maintenance_scheduler_v2_sync import sync_v2_program_tasks_to_scheduler
from services.maintenance_tenant_scope import maintenance_scoped_job, maintenance_scoped_tenant, tenant_id_from_record
from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.scheduler_helpers import program_is_schedulable

logger = logging.getLogger(__name__)

async def _equipment_ids_with_schedules(equipment_type_id: str) -> List[str]:
    equipment_ids: Set[str] = set()
    async for prog in db.maintenance_programs.find(
        {"equipment_type_id": equipment_type_id},
        {"equipment_id": 1, "_id": 0},
    ):
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])
    async for prog in db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"equipment_id": 1, "_id": 0},
    ):
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])
    return list(equipment_ids)
async def filter_schedulable_programs(
    programs: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Keep only programs that may generate schedule occurrences."""
    active_strategy_types = await _active_strategy_type_ids()
    return [
        program
        for program in programs
        if program_is_schedulable(program, active_strategy_types)
    ]


async def refresh_equipment_schedule(
    equipment_id: str,
    user_id: Optional[str] = None,
    skip_scheduling: bool = False,
    strategy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Refresh scheduler programs + occurrences for a single equipment item.

    When called as part of a batch (apply-strategy across many equipment),
    callers can pass `skip_scheduling=True` to defer the (heavy) horizon
    generation, then do ONE batched `schedule_programs_for_equipment(all_ids)`
    call afterwards. They can also pass a pre-loaded `strategy` doc to avoid
    re-fetching equipment_type_strategies on every call.
    """
    from services.maintenance_scheduling import schedule_programs_for_equipment
    from services.maintenance_program_service import MaintenanceProgramService
    from services.scheduler_program_source import load_schedulable_programs

    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped_job({"id": equipment_id}),
        {"_id": 0},
    )
    if not equipment:
        return {"equipment_id": equipment_id, "skipped": True, "reason": "equipment_not_found"}

    equipment_type_id = equipment.get("equipment_type_id")
    equip_tenant = tenant_id_from_record(equipment)
    if strategy is None and equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            maintenance_scoped_tenant(equip_tenant, {"equipment_type_id": equipment_type_id}),
            {"_id": 0},
        )

    created = updated = deactivated = 0
    if strategy:
        created, updated, deactivated = await sync_strategy_programs_for_equipment(equipment, strategy)

    v2_synced = await sync_v2_program_tasks_to_scheduler(equipment, strategy=strategy)
    pm_sync = await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
        equipment_ids=[equipment_id],
        user_id=user_id,
        schedule=False,
    )
    scheduled_created = 0
    if not skip_scheduling:
        scheduled_created = await schedule_programs_for_equipment([equipment_id])

    schedulable_programs = await load_schedulable_programs(equipment_ids=[equipment_id])
    schedule_cleared = 0
    if not schedulable_programs:
        clear_result = await db.scheduled_tasks.delete_many({"equipment_id": equipment_id})
        schedule_cleared = clear_result.deleted_count

    return {
        "equipment_id": equipment_id,
        "strategy_programs_created": created,
        "strategy_programs_updated": updated,
        "strategy_programs_deactivated": deactivated,
        "v2_tasks_synced": v2_synced,
        "pm_import_programs_synced": pm_sync.get("programs_synced", 0),
        "scheduled_tasks_created": scheduled_created,
        "scheduled_tasks_cleared_no_program": schedule_cleared,
        "legacy_program_sync_enabled": should_sync_legacy_maintenance_programs(),
    }


async def refresh_equipment_type_schedules(
    equipment_type_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Refresh schedules for all equipment of a type that already has programs."""
    from services.strategy_propagation import resync_programs_with_strategy

    equipment_ids = await _equipment_ids_with_schedules(equipment_type_id)
    totals = {
        "equipment_type_id": equipment_type_id,
        "equipment_processed": 0,
        "strategy_programs_created": 0,
        "strategy_programs_updated": 0,
        "v2_tasks_synced": 0,
        "pm_import_programs_synced": 0,
        "scheduled_tasks_created": 0,
    }

    for equipment_id in equipment_ids:
        result = await refresh_equipment_schedule(equipment_id, user_id=user_id)
        if result.get("skipped"):
            continue
        totals["equipment_processed"] += 1
        totals["strategy_programs_created"] += result.get("strategy_programs_created", 0)
        totals["strategy_programs_updated"] += result.get("strategy_programs_updated", 0)
        totals["v2_tasks_synced"] += result.get("v2_tasks_synced", 0)
        totals["pm_import_programs_synced"] += result.get("pm_import_programs_synced", 0)
        totals["scheduled_tasks_created"] += result.get("scheduled_tasks_created", 0)

    resync = await resync_programs_with_strategy(equipment_type_id)
    totals.update(
        {
            "programs_activated": resync.get("programs_activated", 0),
            "programs_deactivated": resync.get("programs_deactivated", 0),
            "scheduled_tasks_cancelled": resync.get("scheduled_tasks_cancelled", 0),
        }
    )
    return totals


async def propagate_strategy_schedule_updates(
    equipment_type_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Regenerate v2 maintenance programs and scheduled_tasks for equipment that
    already had strategy applied (maintenance_programs_v2 exists).

    Strategy edits alone do not run the Apply Strategy dialog; this keeps the
    schedule timeline in sync for equipment already covered.
    """
    from services.maintenance_program_service import MaintenanceProgramService
    from services.maintenance_scheduling import schedule_programs_for_equipment
    from services.strategy_propagation import resync_programs_with_strategy

    program_docs = await db.maintenance_programs_v2.find(
        maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
        {"equipment_id": 1, "_id": 0},
    ).to_list(5000)
    equipment_ids = list(
        {doc["equipment_id"] for doc in program_docs if doc.get("equipment_id")}
    )
    if not equipment_ids:
        return {
            "equipment_type_id": equipment_type_id,
            "equipment_count": 0,
            "programs_regenerated": 0,
            "scheduled_tasks_created": 0,
        }

    await resync_programs_with_strategy(equipment_type_id)

    regenerated = 0
    errors: List[str] = []
    for equipment_id in equipment_ids:
        try:
            await MaintenanceProgramService.regenerate_program(
                equipment_id=equipment_id,
                user_id=user_id,
            )
            regenerated += 1
        except Exception as exc:
            logger.warning(
                "Regenerate program failed for %s after strategy change: %s",
                equipment_id,
                exc,
            )
            errors.append(f"{equipment_id}: {exc}")

    scheduled_created = await schedule_programs_for_equipment(equipment_ids)

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_count": len(equipment_ids),
        "programs_regenerated": regenerated,
        "scheduled_tasks_created": scheduled_created,
        "errors": errors,
    }
