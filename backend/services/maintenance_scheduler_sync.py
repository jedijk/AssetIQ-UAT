"""
Sync maintenance strategy / program changes to the scheduler (maintenance_programs
+ scheduled_tasks) so equipment-type and all-equipment schedule views stay current.
"""
import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from database import db
from models.maintenance_program import TaskSource
from models.maintenance_scheduler import CriticalityLevel, EquipmentMaintenanceProgram
from services.scheduler_helpers import (
    build_task_to_failure_modes,
    frequency_to_days,
    is_strategy_task_active,
    normalize_program_criticality,
    program_has_active_strategy,
    program_is_strategy_backed,
    program_is_schedulable,
    STRATEGY_EXEMPT_TASK_SOURCES,
)

logger = logging.getLogger(__name__)

OPEN_TASK_STATUSES = {"$nin": ["completed", "cancelled"]}
_ACTIVE_STRATEGY_CACHE: Optional[Tuple[float, Set[str]]] = None
_ACTIVE_STRATEGY_CACHE_TTL = 60.0


async def sync_strategy_programs_for_equipment(
    equipment: Dict[str, Any],
    strategy: Dict[str, Any],
) -> Tuple[int, int, int]:
    """Upsert legacy maintenance_programs from active strategy task templates for one equipment."""
    equipment_type_id = strategy.get("equipment_type_id") or equipment.get("equipment_type_id")
    equipment_id = equipment.get("id")
    if not equipment_id or not equipment_type_id:
        return 0, 0, 0

    task_templates = strategy.get("task_templates") or []
    task_to_fms = build_task_to_failure_modes(strategy)

    created = 0
    updated = 0
    deactivated = 0
    active_task_ids: Set[str] = set()
    today = datetime.utcnow().date().isoformat()
    equip_criticality = normalize_program_criticality(equipment.get("criticality"))
    strategy_version = strategy.get("version", "1.0")

    for task in task_templates:
        if not is_strategy_task_active(task, task_to_fms=task_to_fms):
            continue

        task_id = task.get("id")
        if not task_id:
            continue
        active_task_ids.add(task_id)

        task_type = task.get("task_type", "preventive")
        freq_matrix = task.get("frequency_matrix") or {}
        frequency = freq_matrix.get(equip_criticality, "monthly")
        linked_fms = task_to_fms.get(task_id, [])
        enabled_fm = next(
            (fm for fm in linked_fms if fm.get("enabled") is not False),
            linked_fms[0] if linked_fms else None,
        )
        fm_id = enabled_fm.get("failure_mode_id") if enabled_fm else None
        fm_name = enabled_fm.get("failure_mode_name") if enabled_fm else None

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

    async for prog in db.maintenance_programs.find(
        {"equipment_id": equipment_id, "equipment_type_id": equipment_type_id},
        {"id": 1, "task_template_id": 1, "is_active": 1, "_id": 1},
    ):
        if not program_is_strategy_backed(prog):
            continue
        template_id = prog.get("task_template_id")
        if not template_id or template_id in active_task_ids:
            continue
        if not prog.get("is_active", True):
            continue
        await db.maintenance_programs.update_one(
            {"_id": prog["_id"]},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
        )
        if prog.get("id"):
            await _cancel_open_scheduled_for_program_ids([prog["id"]])
        deactivated += 1

    return created, updated, deactivated


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
    task_to_fms = build_task_to_failure_modes(strategy) if strategy else {}
    template_by_id = {
        t.get("id"): t for t in (strategy.get("task_templates") or []) if t.get("id")
    } if strategy else {}

    async def deactivate_legacy_for_template(template_id: str) -> None:
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

            template = template_by_id.get(template_id)
            strategy_active = bool(
                template and is_strategy_task_active(template, task_to_fms=task_to_fms)
            ) if strategy else False

            if not strategy_active or not is_active:
                await deactivate_legacy_for_template(template_id)
                continue

            active_v2_ids.add(v2_task_id)

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
    global _ACTIVE_STRATEGY_CACHE
    now = time.monotonic()
    if _ACTIVE_STRATEGY_CACHE is not None:
        cached_at, cached_ids = _ACTIVE_STRATEGY_CACHE
        if now - cached_at < _ACTIVE_STRATEGY_CACHE_TTL:
            return cached_ids

    ids = {
        doc["equipment_type_id"]
        async for doc in db.equipment_type_strategies.find(
            {},
            {"equipment_type_id": 1, "_id": 0},
        )
    }
    _ACTIVE_STRATEGY_CACHE = (now, ids)
    return ids


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


async def cleanup_scheduled_tasks_without_active_programs(
    equipment_type_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Delete scheduled tasks for equipment that has no active maintenance programs."""
    program_query: Dict[str, Any] = {"is_active": True}
    if equipment_type_id:
        program_query["equipment_type_id"] = equipment_type_id

    equipped: Set[str] = set()
    async for prog in db.maintenance_programs.find(program_query, {"equipment_id": 1, "_id": 0}):
        if prog.get("equipment_id"):
            equipped.add(prog["equipment_id"])

    task_query: Dict[str, Any] = {}
    equipment_without_programs: List[str] = []

    if equipment_type_id:
        type_equipment_ids = [
            eq["id"]
            async for eq in db.equipment_nodes.find(
                {"equipment_type_id": equipment_type_id},
                {"id": 1, "_id": 0},
            )
            if eq.get("id")
        ]
        equipment_without_programs = [
            eid for eid in type_equipment_ids if eid not in equipped
        ]
        if not equipment_without_programs:
            return {
                "equipment_type_id": equipment_type_id,
                "scheduled_tasks_deleted": 0,
                "equipment_without_programs": [],
            }
        task_query["equipment_id"] = {"$in": equipment_without_programs}
    elif equipped:
        task_query["equipment_id"] = {"$nin": list(equipped)}
    else:
        task_query = {}

    result = await db.scheduled_tasks.delete_many(task_query)
    return {
        "equipment_type_id": equipment_type_id,
        "scheduled_tasks_deleted": result.deleted_count,
        "equipment_without_programs": equipment_without_programs,
    }


async def cleanup_stale_strategy_schedules(
    equipment_type_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Remove strategy-backed programs and scheduled tasks that no longer match
    active strategy tasks (disabled FM, is_mandatory off, deleted template, etc.).
    """
    from services.scheduler_helpers import build_task_to_failure_modes, is_strategy_task_active

    strategy_query: Dict[str, Any] = {}
    if equipment_type_id:
        strategy_query["equipment_type_id"] = equipment_type_id

    strategies = await db.equipment_type_strategies.find(strategy_query, {"_id": 0}).to_list(500)
    stale_program_ids: List[str] = []

    for strategy in strategies:
        etid = strategy.get("equipment_type_id")
        if not etid:
            continue
        task_to_fms = build_task_to_failure_modes(strategy)
        active_task_ids = {
            t.get("id")
            for t in (strategy.get("task_templates") or [])
            if t.get("id") and is_strategy_task_active(t, task_to_fms=task_to_fms)
        }
        program_query: Dict[str, Any] = {
            "$or": [{"equipment_type_id": etid}, {"strategy_id": etid}],
        }
        async for prog in db.maintenance_programs.find(
            program_query,
            {"id": 1, "task_template_id": 1, "is_active": 1, "task_source": 1, "pm_import_task_id": 1, "_id": 0},
        ):
            if not program_is_strategy_backed(prog):
                continue
            template_id = prog.get("task_template_id")
            is_stale = (
                not template_id
                or template_id not in active_task_ids
                or not prog.get("is_active", True)
            )
            if is_stale and prog.get("id"):
                stale_program_ids.append(prog["id"])

    scheduled_tasks_deleted = 0
    programs_deleted = 0
    if stale_program_ids:
        unique_ids = list(dict.fromkeys(stale_program_ids))
        sched_result = await db.scheduled_tasks.delete_many(
            {"maintenance_program_id": {"$in": unique_ids}},
        )
        scheduled_tasks_deleted = sched_result.deleted_count
        prog_result = await db.maintenance_programs.delete_many({"id": {"$in": unique_ids}})
        programs_deleted = prog_result.deleted_count

    return {
        "equipment_type_id": equipment_type_id,
        "stale_program_ids": stale_program_ids,
        "scheduled_tasks_deleted": scheduled_tasks_deleted,
        "programs_deleted": programs_deleted,
    }


async def cleanup_schedules_without_strategy(
    equipment_type_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Remove stale strategy schedule items and programs/tasks whose equipment-type
    strategy no longer exists.
    """
    stale_cleanup = await cleanup_stale_strategy_schedules(equipment_type_id)
    no_program_cleanup = await cleanup_scheduled_tasks_without_active_programs(
        equipment_type_id,
    )

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

    # Find ALL programs whose strategy no longer exists (regardless of task_source)
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
        # Check if program has a strategy_id or equipment_type_id that no longer exists
        has_missing_strategy = False
        for key in ("strategy_id", "equipment_type_id"):
            value = prog.get(key)
            if value and value not in active_strategy_types:
                missing_strategy_ids.add(value)
                has_missing_strategy = True
        
        # Mark program as orphan if its strategy is missing
        if has_missing_strategy:
            program_id = prog.get("id")
            if program_id:
                orphan_program_ids.append(program_id)

    if equipment_type_id and equipment_type_id not in active_strategy_types:
        missing_strategy_ids.add(equipment_type_id)

    all_program_ids = {
        p["id"]
        async for p in db.maintenance_programs.find({}, {"id": 1, "_id": 0})
        if p.get("id")
    }

    task_delete_filters: List[Dict[str, Any]] = []
    
    # Delete tasks belonging to orphan programs
    if orphan_program_ids:
        task_delete_filters.append({"maintenance_program_id": {"$in": orphan_program_ids}})

    # Delete tasks with strategy_id that no longer exists (regardless of task_source)
    if missing_strategy_ids:
        strategy_task_filter: Dict[str, Any] = {
            "strategy_id": {"$in": list(missing_strategy_ids)},
            # Removed task_source exclusion - delete ALL orphan tasks
        }
        if scoped_equipment_ids:
            strategy_task_filter["equipment_id"] = {"$in": list(scoped_equipment_ids)}
        task_delete_filters.append(strategy_task_filter)

    # Delete tasks referencing non-existent programs (regardless of task_source)
    broken_program_filter: Dict[str, Any] = {
        "maintenance_program_id": {"$nin": list(all_program_ids), "$ne": None},
        # Removed task_source exclusion - delete ALL orphan tasks
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

    # Also clean up maintenance_programs_v2 with missing strategies
    v2_program_query: Dict[str, Any] = {}
    if equipment_type_id:
        v2_program_query["equipment_type_id"] = equipment_type_id
    
    orphan_v2_program_ids: List[str] = []
    async for prog in db.maintenance_programs_v2.find(
        v2_program_query,
        {"id": 1, "equipment_type_id": 1, "_id": 0},
    ):
        eq_type = prog.get("equipment_type_id")
        if eq_type and eq_type not in active_strategy_types:
            prog_id = prog.get("id")
            if prog_id:
                orphan_v2_program_ids.append(prog_id)
            if eq_type not in missing_strategy_ids:
                missing_strategy_ids.add(eq_type)

    v2_programs_deleted = 0
    if orphan_v2_program_ids:
        v2_result = await db.maintenance_programs_v2.delete_many(
            {"id": {"$in": orphan_v2_program_ids}},
        )
        v2_programs_deleted = v2_result.deleted_count

    return {
        "equipment_type_id": equipment_type_id,
        "equipment_types_cleaned": len(missing_strategy_ids),
        "scheduled_tasks_deleted": (
            scheduled_tasks_deleted
            + stale_cleanup.get("scheduled_tasks_deleted", 0)
            + no_program_cleanup.get("scheduled_tasks_deleted", 0)
        ),
        "programs_deleted": programs_deleted + stale_cleanup.get("programs_deleted", 0),
        "v2_programs_deleted": v2_programs_deleted,
        "missing_strategy_ids": sorted(missing_strategy_ids),
        "orphan_program_ids": orphan_program_ids,
        "orphan_v2_program_ids": orphan_v2_program_ids,
        "stale_program_ids": stale_cleanup.get("stale_program_ids", []),
        "stale_cleanup": stale_cleanup,
        "no_program_cleanup": no_program_cleanup,
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
    from routes.maintenance_scheduler.scheduler import schedule_programs_for_equipment
    from services.maintenance_program_service import MaintenanceProgramService

    equipment = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0})
    if not equipment:
        return {"equipment_id": equipment_id, "skipped": True, "reason": "equipment_not_found"}

    equipment_type_id = equipment.get("equipment_type_id")
    if strategy is None and equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
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

    active_program_count = await db.maintenance_programs.count_documents(
        {"equipment_id": equipment_id, "is_active": True},
    )
    schedule_cleared = 0
    if active_program_count == 0:
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
