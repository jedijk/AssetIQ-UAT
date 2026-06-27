"""Cleanup stale scheduler programs and scheduled tasks."""
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from database import db
from services.maintenance_scheduler_shared import (
    OPEN_TASK_STATUSES,
    _active_strategy_type_ids,
    _equipment_ids_for_type,
)
from services.maintenance_tenant_scope import maintenance_scoped_job
from services.scheduler_helpers import program_is_strategy_backed


async def clear_equipment_schedule_after_program_delete(
    equipment_id: str,
) -> Dict[str, Any]:
    """Cancel open scheduled tasks and deactivate legacy programs when a v2 program is deleted."""
    legacy_programs = await db.maintenance_programs.find(
        maintenance_scoped_job({"equipment_id": equipment_id}),
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
        maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
        {"id": 1, "_id": 0},
    ):
        if eq.get("id"):
            equipment_ids.add(eq["id"])

    program_ids: List[str] = []
    async for prog in db.maintenance_programs.find(
        maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
        {"id": 1, "equipment_id": 1, "_id": 0},
    ):
        if prog.get("id"):
            program_ids.append(prog["id"])
        if prog.get("equipment_id"):
            equipment_ids.add(prog["equipment_id"])

    async for prog in db.maintenance_programs_v2.find(
        maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
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


async def cleanup_scheduled_tasks_without_active_programs(
    equipment_type_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Delete scheduled tasks for equipment that has no active maintenance programs."""
    program_query: Dict[str, Any] = {"is_active": True}
    if equipment_type_id:
        program_query["equipment_type_id"] = equipment_type_id

    equipped: Set[str] = set()
    async for prog in db.maintenance_programs.find(maintenance_scoped_job(program_query), {"equipment_id": 1, "_id": 0}):
        if prog.get("equipment_id"):
            equipped.add(prog["equipment_id"])

    task_query: Dict[str, Any] = {}
    equipment_without_programs: List[str] = []

    if equipment_type_id:
        type_equipment_ids = [
            eq["id"]
            async for eq in db.equipment_nodes.find(
                maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
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

    strategies = await db.equipment_type_strategies.find(maintenance_scoped_job(strategy_query), {"_id": 0}).to_list(500)
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
            maintenance_scoped_job(program_query),
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
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Remove stale strategy schedule items and programs/tasks whose equipment-type
    strategy no longer exists.
    """
    from services.maintenance_tenant_scope import maintenance_scoped

    def _scope(query: Dict[str, Any]) -> Dict[str, Any]:
        return maintenance_scoped(user, query) if user else maintenance_scoped_job(query)

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
        _scope(program_query),
        {
            "id": 1,
            "strategy_id": 1,
            "equipment_type_id": 1,
            "task_source": 1,
            "pm_import_task_id": 1,
            "_id": 0,
        },
    ):
        if prog.get("pm_import_task_id"):
            continue
        if (prog.get("task_source") or "").lower() == "customer_imported":
            continue
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
        async for p in db.maintenance_programs.find(_scope({}), {"id": 1, "_id": 0})
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
            "$and": [
                {
                    "$or": [
                        {"pm_import_task_id": {"$exists": False}},
                        {"pm_import_task_id": None},
                    ]
                },
                {
                    "$or": [
                        {"task_source": {"$exists": False}},
                        {"task_source": {"$nin": ["customer_imported"]}},
                    ]
                },
            ],
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
        _scope(v2_program_query),
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
