"""
Sync maintenance strategy / program changes to the scheduler (maintenance_programs
+ scheduled_tasks) so equipment-type and all-equipment schedule views stay current.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from database import db
from models.maintenance_program import TaskSource
from models.maintenance_scheduler import CriticalityLevel, EquipmentMaintenanceProgram
from services.scheduler_helpers import (
    frequency_to_days,
    normalize_program_criticality,
    program_has_active_strategy,
    program_is_strategy_backed,
    program_is_schedulable,
    STRATEGY_EXEMPT_TASK_SOURCES,
)

logger = logging.getLogger(__name__)

OPEN_TASK_STATUSES = {"$nin": ["completed", "cancelled"]}


def _build_task_to_fm(strategy: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    task_to_fm: Dict[str, Dict[str, Any]] = {}
    for fm in strategy.get("failure_mode_strategies") or []:
        for tid in fm.get("task_ids") or []:
            task_to_fm.setdefault(tid, fm)
    return task_to_fm


async def sync_strategy_programs_for_equipment(
    equipment: Dict[str, Any],
    strategy: Dict[str, Any],
    task_to_fm: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Tuple[int, int]:
    """Upsert legacy maintenance_programs from strategy task templates for one equipment."""
    equipment_type_id = strategy.get("equipment_type_id") or equipment.get("equipment_type_id")
    equipment_id = equipment.get("id")
    if not equipment_id or not equipment_type_id:
        return 0, 0

    task_templates = strategy.get("task_templates") or []
    if task_to_fm is None:
        task_to_fm = _build_task_to_fm(strategy)

    created = 0
    updated = 0
    today = datetime.utcnow().date().isoformat()
    equip_criticality = normalize_program_criticality(equipment.get("criticality"))
    strategy_version = strategy.get("version", "1.0")

    for task in task_templates:
        if not task.get("is_mandatory", True):
            continue
        task_type = task.get("task_type", "preventive")
        if task_type in ("reactive", "corrective"):
            continue

        task_id = task.get("id")
        if not task_id:
            continue

        freq_matrix = task.get("frequency_matrix") or {}
        frequency = freq_matrix.get(equip_criticality, "monthly")
        fm_for_task = task_to_fm.get(task_id)
        fm_id = fm_for_task.get("failure_mode_id") if fm_for_task else None
        fm_name = fm_for_task.get("failure_mode_name") if fm_for_task else None

        existing = await db.maintenance_programs.find_one(
            {"equipment_id": equipment_id, "task_template_id": task_id},
        )
        common_fields = {
            "equipment_name": equipment.get("name"),
            "equipment_tag": equipment.get("tag"),
            "equipment_type_id": equipment_type_id,
            "equipment_type_name": strategy.get("equipment_type_name", ""),
            "task_name": task.get("name"),
            "task_description": task.get("description"),
            "task_type": task_type,
            "frequency": frequency,
            "frequency_days": frequency_to_days(frequency),
            "criticality": equip_criticality,
            "estimated_duration_hours": task.get("duration_hours", 1.0),
            "strategy_id": equipment_type_id,
            "strategy_version": strategy_version,
            "failure_mode_id": fm_id,
            "failure_mode_name": fm_name,
            "discipline": task.get("discipline"),
            "skills_required": task.get("skills_required") or [],
            "task_source": TaskSource.STRATEGY_GENERATED.value,
            "is_active": True,
            "updated_at": datetime.utcnow().isoformat(),
        }

        if existing:
            await db.maintenance_programs.update_one(
                {"_id": existing["_id"]},
                {"$set": common_fields},
            )
            updated += 1
        else:
            program = EquipmentMaintenanceProgram(
                equipment_id=equipment_id,
                equipment_name=equipment.get("name", ""),
                equipment_tag=equipment.get("tag"),
                equipment_type_id=equipment_type_id,
                equipment_type_name=strategy.get("equipment_type_name", ""),
                task_template_id=task_id,
                task_name=task.get("name", "Maintenance Task"),
                task_description=task.get("description"),
                task_type=task_type,
                frequency=frequency,
                frequency_days=frequency_to_days(frequency),
                criticality=CriticalityLevel(equip_criticality),
                estimated_duration_hours=task.get("duration_hours", 1.0),
                next_due_date=today,
                strategy_id=equipment_type_id,
                strategy_version=strategy_version,
                failure_mode_id=fm_id,
                failure_mode_name=fm_name,
                discipline=task.get("discipline"),
                skills_required=task.get("skills_required") or [],
            )
            doc = program.model_dump()
            doc["task_source"] = TaskSource.STRATEGY_GENERATED.value
            await db.maintenance_programs.insert_one(doc)
            created += 1

    return created, updated


async def _cancel_open_scheduled_for_program_ids(program_ids: List[str]) -> int:
    if not program_ids:
        return 0
    result = await db.scheduled_tasks.update_many(
        {
            "maintenance_program_id": {"$in": program_ids},
            "status": OPEN_TASK_STATUSES,
        },
        {
            "$set": {
                "status": "cancelled",
                "notes": "Auto-cancelled: maintenance program task removed or deactivated",
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )
    return result.modified_count


async def sync_v2_program_tasks_to_scheduler(
    equipment: Dict[str, Any],
    strategy: Optional[Dict[str, Any]] = None,
) -> int:
    """Mirror v2 program tasks (manual, overrides, inactive state) to legacy programs."""
    equipment_id = equipment.get("id")
    if not equipment_id:
        return 0

    program_v2 = await db.maintenance_programs_v2.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0},
    )
    if not program_v2:
        return 0

    equipment_type_id = (
        program_v2.get("equipment_type_id") or equipment.get("equipment_type_id") or ""
    )
    if strategy is None and equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
            {"_id": 0},
        )

    synced = 0
    active_v2_ids: Set[str] = set()
    today = datetime.utcnow().date().isoformat()
    equip_criticality = normalize_program_criticality(equipment.get("criticality"))

    for task in program_v2.get("tasks") or []:
        v2_task_id = task.get("id")
        if not v2_task_id:
            continue

        source = task.get("task_source")
        is_active = task.get("is_active", True)
        trace = task.get("traceability") or {}

        if source == TaskSource.CUSTOMER_IMPORTED.value:
            continue

        if source == TaskSource.STRATEGY_GENERATED.value:
            template_id = trace.get("task_template_id")
            if not template_id:
                continue
            active_v2_ids.add(v2_task_id)
            if not is_active:
                prog = await db.maintenance_programs.find_one(
                    {"equipment_id": equipment_id, "task_template_id": template_id},
                    {"id": 1, "_id": 0},
                )
                await db.maintenance_programs.update_many(
                    {"equipment_id": equipment_id, "task_template_id": template_id},
                    {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
                )
                if prog:
                    await _cancel_open_scheduled_for_program_ids([prog["id"]])
                continue

            override_fields: Dict[str, Any] = {}
            if task.get("is_overridden"):
                freq = task.get("frequency") or "monthly"
                if hasattr(freq, "value"):
                    freq = freq.value
                freq = str(freq).lower()
                override_fields = {
                    "task_name": task.get("task_title"),
                    "task_description": task.get("task_description"),
                    "frequency": freq,
                    "frequency_days": int(task.get("frequency_days") or frequency_to_days(freq)),
                    "estimated_duration_hours": float(
                        task.get("estimated_duration_hours") or 1.0
                    ),
                    "discipline": task.get("discipline"),
                    "is_active": True,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            elif not is_active:
                override_fields = {"is_active": False, "updated_at": datetime.utcnow().isoformat()}

            if override_fields:
                await db.maintenance_programs.update_one(
                    {"equipment_id": equipment_id, "task_template_id": template_id},
                    {"$set": override_fields},
                )
                synced += 1
            continue

        if source not in (
            TaskSource.MANUAL.value,
            TaskSource.AI_GENERATED.value,
            TaskSource.EQUIPMENT_SPECIFIC.value,
        ):
            continue

        active_v2_ids.add(v2_task_id)
        if not is_active:
            inactive = await db.maintenance_programs.find(
                {"equipment_id": equipment_id, "v2_task_id": v2_task_id},
                {"id": 1, "_id": 0},
            ).to_list(10)
            await db.maintenance_programs.update_many(
                {"equipment_id": equipment_id, "v2_task_id": v2_task_id},
                {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
            )
            await _cancel_open_scheduled_for_program_ids([p["id"] for p in inactive])
            continue

        freq = task.get("frequency") or "monthly"
        if hasattr(freq, "value"):
            freq = freq.value
        frequency = str(freq).lower()
        freq_days = int(task.get("frequency_days") or frequency_to_days(frequency))
        raw_type = (task.get("task_type") or "preventive").lower()

        existing = await db.maintenance_programs.find_one(
            {"equipment_id": equipment_id, "v2_task_id": v2_task_id},
        )
        update_fields: Dict[str, Any] = {
            "equipment_name": equipment.get("name", ""),
            "equipment_tag": equipment.get("tag"),
            "equipment_type_id": equipment_type_id,
            "equipment_type_name": program_v2.get("equipment_type_name")
            or equipment.get("equipment_type_name")
            or "",
            "task_template_id": v2_task_id,
            "v2_task_id": v2_task_id,
            "task_name": task.get("task_title") or "Maintenance Task",
            "task_description": task.get("task_description"),
            "task_type": raw_type,
            "task_source": source,
            "frequency": frequency,
            "frequency_days": freq_days,
            "criticality": equip_criticality,
            "estimated_duration_hours": float(task.get("estimated_duration_hours") or 1.0),
            "strategy_id": equipment_type_id or "program",
            "strategy_version": program_v2.get("version") or "1.0",
            "failure_mode_id": trace.get("failure_mode_id"),
            "failure_mode_name": trace.get("failure_mode_name"),
            "discipline": task.get("discipline"),
            "is_active": True,
            "updated_at": datetime.utcnow().isoformat(),
        }

        if existing:
            await db.maintenance_programs.update_one(
                {"_id": existing["_id"]},
                {"$set": update_fields},
            )
        else:
            scheduler_program = EquipmentMaintenanceProgram(
                equipment_id=equipment_id,
                equipment_name=update_fields["equipment_name"],
                equipment_tag=update_fields["equipment_tag"],
                equipment_type_id=equipment_type_id,
                equipment_type_name=update_fields["equipment_type_name"],
                task_template_id=v2_task_id,
                task_name=update_fields["task_name"],
                task_description=update_fields["task_description"],
                task_type=raw_type,
                frequency=frequency,
                frequency_days=freq_days,
                criticality=CriticalityLevel(equip_criticality),
                estimated_duration_hours=update_fields["estimated_duration_hours"],
                next_due_date=today,
                strategy_id=update_fields["strategy_id"],
                strategy_version=update_fields["strategy_version"],
                failure_mode_id=update_fields["failure_mode_id"],
                failure_mode_name=update_fields["failure_mode_name"],
                discipline=update_fields["discipline"],
            )
            doc = scheduler_program.model_dump()
            doc["v2_task_id"] = v2_task_id
            doc["task_source"] = source
            await db.maintenance_programs.insert_one(doc)

        synced += 1

    stale = await db.maintenance_programs.find(
        {
            "equipment_id": equipment_id,
            "v2_task_id": {"$exists": True, "$nin": list(active_v2_ids)},
            "task_source": {
                "$in": [
                    TaskSource.MANUAL.value,
                    TaskSource.AI_GENERATED.value,
                    TaskSource.EQUIPMENT_SPECIFIC.value,
                ]
            },
        },
        {"id": 1, "_id": 0},
    ).to_list(100)
    if stale:
        stale_ids = [p["id"] for p in stale]
        await db.maintenance_programs.update_many(
            {"id": {"$in": stale_ids}},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
        )
        await _cancel_open_scheduled_for_program_ids(stale_ids)

    return synced


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


async def clear_equipment_schedule_after_program_delete(
    equipment_id: str,
) -> Dict[str, Any]:
    """Cancel open scheduled tasks and deactivate legacy programs when a v2 program is deleted."""
    legacy_programs = await db.maintenance_programs.find(
        {"equipment_id": equipment_id},
        {"id": 1, "_id": 0},
    ).to_list(10000)
    program_ids = [p["id"] for p in legacy_programs if p.get("id")]

    cancel_filter: Dict[str, Any] = {"status": OPEN_TASK_STATUSES}
    if program_ids:
        cancel_filter["$or"] = [
            {"equipment_id": equipment_id},
            {"maintenance_program_id": {"$in": program_ids}},
        ]
    else:
        cancel_filter["equipment_id"] = equipment_id

    scheduled_result = await db.scheduled_tasks.update_many(
        cancel_filter,
        {
            "$set": {
                "status": "cancelled",
                "notes": "Auto-cancelled: maintenance program deleted",
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )

    programs_result = await db.maintenance_programs.update_many(
        {"equipment_id": equipment_id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
    )

    return {
        "equipment_id": equipment_id,
        "scheduled_tasks_cancelled": scheduled_result.modified_count,
        "legacy_programs_deactivated": programs_result.modified_count,
    }


async def clear_equipment_type_schedule_after_strategy_delete(
    equipment_type_id: str,
) -> Dict[str, Any]:
    """Remove scheduler programs and scheduled tasks when an equipment-type strategy is deleted."""
    equipment_ids: Set[str] = set()
    async for eq in db.equipment_nodes.find(
        {"equipment_type_id": equipment_type_id},
        {"id": 1, "_id": 0},
    ):
        if eq.get("id"):
            equipment_ids.add(eq["id"])

    program_ids: List[str] = []
    async for prog in db.maintenance_programs.find(
        {"equipment_type_id": equipment_type_id},
        {"id": 1, "equipment_id": 1, "_id": 0},
    ):
        if prog.get("id"):
            program_ids.append(prog["id"])
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])

    async for prog in db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"equipment_id": 1, "_id": 0},
    ):
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])

    scheduled_delete_filters: List[Dict[str, Any]] = [{"strategy_id": equipment_type_id}]
    if program_ids:
        scheduled_delete_filters.append({"maintenance_program_id": {"$in": program_ids}})
    if equipment_ids:
        scheduled_delete_filters.append({"equipment_id": {"$in": list(equipment_ids)}})

    scheduled_deleted = 0
    if scheduled_delete_filters:
        scheduled_result = await db.scheduled_tasks.delete_many(
            {"$or": scheduled_delete_filters},
        )
        scheduled_deleted = scheduled_result.deleted_count

    programs_result = await db.maintenance_programs.delete_many(
        {"equipment_type_id": equipment_type_id},
    )

    v2_delete_query: Dict[str, Any] = {"$or": [{"equipment_type_id": equipment_type_id}]}
    if equipment_ids:
        v2_delete_query["$or"].append({"equipment_id": {"$in": list(equipment_ids)}})
    v2_result = await db.maintenance_programs_v2.delete_many(v2_delete_query)

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_ids_affected": len(equipment_ids),
        "scheduled_tasks_deleted": scheduled_deleted,
        "programs_deleted": programs_result.deleted_count,
        "v2_programs_deleted": v2_result.deleted_count,
    }


async def _active_strategy_type_ids() -> Set[str]:
    return {
        doc["equipment_type_id"]
        async for doc in db.equipment_type_strategies.find(
            {},
            {"equipment_type_id": 1, "_id": 0},
        )
    }


async def _equipment_ids_for_type(equipment_type_id: str) -> Set[str]:
    equipment_ids: Set[str] = set()
    async for eq in db.equipment_nodes.find(
        {"equipment_type_id": equipment_type_id},
        {"id": 1, "_id": 0},
    ):
        if eq.get("id"):
            equipment_ids.add(eq["id"])
    async for prog in db.maintenance_programs.find(
        {"$or": [{"equipment_type_id": equipment_type_id}, {"strategy_id": equipment_type_id}]},
        {"equipment_id": 1, "_id": 0},
    ):
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])
    return equipment_ids


async def cleanup_schedules_without_strategy(
    equipment_type_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Remove strategy-backed programs/tasks whose equipment-type strategy no longer exists."""
    active_strategy_types = await _active_strategy_type_ids()
    scoped_equipment_ids: Optional[Set[str]] = None
    if equipment_type_id:
        scoped_equipment_ids = await _equipment_ids_for_type(equipment_type_id)

    program_query: Dict[str, Any] = {}
    if equipment_type_id:
        program_query["$or"] = [
            {"equipment_type_id": equipment_type_id},
            {"strategy_id": equipment_type_id},
        ]

    orphan_program_ids: List[str] = []
    missing_strategy_ids: Set[str] = set()

    async for prog in db.maintenance_programs.find(
        program_query,
        {
            "id": 1,
            "strategy_id": 1,
            "equipment_type_id": 1,
            "task_source": 1,
            "pm_import_task_id": 1,
            "_id": 0,
        },
    ):
        if not program_is_strategy_backed(prog):
            continue
        if program_has_active_strategy(prog, active_strategy_types):
            continue
        program_id = prog.get("id")
        if program_id:
            orphan_program_ids.append(program_id)
        for key in ("strategy_id", "equipment_type_id"):
            value = prog.get(key)
            if value and value not in active_strategy_types:
                missing_strategy_ids.add(value)

    if equipment_type_id and equipment_type_id not in active_strategy_types:
        missing_strategy_ids.add(equipment_type_id)

    all_program_ids = {
        p["id"]
        async for p in db.maintenance_programs.find({}, {"id": 1, "_id": 0})
        if p.get("id")
    }

    task_delete_filters: List[Dict[str, Any]] = []
    if orphan_program_ids:
        task_delete_filters.append({"maintenance_program_id": {"$in": orphan_program_ids}})

    if missing_strategy_ids:
        strategy_task_filter: Dict[str, Any] = {
            "strategy_id": {"$in": list(missing_strategy_ids)},
            "task_source": {"$nin": list(STRATEGY_EXEMPT_TASK_SOURCES)},
        }
        if scoped_equipment_ids:
            strategy_task_filter["equipment_id"] = {"$in": list(scoped_equipment_ids)}
        task_delete_filters.append(strategy_task_filter)

    broken_program_filter: Dict[str, Any] = {
        "maintenance_program_id": {"$nin": list(all_program_ids), "$ne": None},
        "task_source": {"$nin": list(STRATEGY_EXEMPT_TASK_SOURCES)},
    }
    if scoped_equipment_ids:
        broken_program_filter["equipment_id"] = {"$in": list(scoped_equipment_ids)}
    task_delete_filters.append(broken_program_filter)

    scheduled_tasks_deleted = 0
    if task_delete_filters:
        delete_query = task_delete_filters[0] if len(task_delete_filters) == 1 else {"$or": task_delete_filters}
        scheduled_result = await db.scheduled_tasks.delete_many(delete_query)
        scheduled_tasks_deleted = scheduled_result.deleted_count

    programs_deleted = 0
    if orphan_program_ids:
        programs_result = await db.maintenance_programs.delete_many(
            {"id": {"$in": orphan_program_ids}},
        )
        programs_deleted = programs_result.deleted_count

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_types_cleaned": len(missing_strategy_ids),
        "scheduled_tasks_deleted": scheduled_tasks_deleted,
        "programs_deleted": programs_deleted,
        "v2_programs_deleted": 0,
        "missing_strategy_ids": sorted(missing_strategy_ids),
        "orphan_program_ids": orphan_program_ids,
    }


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
) -> Dict[str, Any]:
    """Refresh scheduler programs + occurrences for a single equipment item."""
    from routes.maintenance_scheduler.scheduler import schedule_programs_for_equipment
    from services.maintenance_program_service import MaintenanceProgramService

    equipment = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0})
    if not equipment:
        return {"equipment_id": equipment_id, "skipped": True, "reason": "equipment_not_found"}

    equipment_type_id = equipment.get("equipment_type_id")
    strategy = None
    if equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
            {"_id": 0},
        )

    created = updated = 0
    if strategy:
        created, updated = await sync_strategy_programs_for_equipment(equipment, strategy)

    v2_synced = await sync_v2_program_tasks_to_scheduler(equipment, strategy=strategy)
    pm_sync = await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
        equipment_ids=[equipment_id],
        user_id=user_id,
        schedule=False,
    )
    scheduled_created = await schedule_programs_for_equipment([equipment_id])

    return {
        "equipment_id": equipment_id,
        "strategy_programs_created": created,
        "strategy_programs_updated": updated,
        "v2_tasks_synced": v2_synced,
        "pm_import_programs_synced": pm_sync.get("programs_synced", 0),
        "scheduled_tasks_created": scheduled_created,
    }


async def refresh_equipment_type_schedules(
    equipment_type_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Refresh schedules for all equipment of a type that already has programs."""
    from routes.maintenance_strategy_v2.propagation import _resync_programs_with_strategy

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

    resync = await _resync_programs_with_strategy(equipment_type_id)
    totals.update(
        {
            "programs_activated": resync.get("programs_activated", 0),
            "programs_deactivated": resync.get("programs_deactivated", 0),
            "scheduled_tasks_cancelled": resync.get("scheduled_tasks_cancelled", 0),
        }
    )
    return totals
