"""Intelligence map routes — service layer."""


from typing import Optional
import logging

from database import db, installation_filter
from services.cache_service import cache
from services.equipment_type_registry import count_equipment_types, list_equipment_types
from services.equipment_hierarchy_filters import apply_plant_system_filters
from services.db_monitoring import timed_aggregate
from services.intelligence_map_pm_import_matchers import (
    PM_IMPORT_ACTIVE_TASK_MATCH,
    PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH,
    PM_IMPORT_IMPORTED_TASK_MATCH,
    normalize_equipment_tags,
    pm_import_equipment_linked_task_match,
    pm_import_imported_task_match,
    pm_import_task_match,
)
from services.reliability_graph_query import (
    count_active_reliability_edges,
    count_edges_by_relation,
)
from services.tenant_schema import tenant_id_from_user, prepend_tenant_match
from services.tenant_scope import scoped

logger = logging.getLogger(__name__)

_normalize_equipment_tags = normalize_equipment_tags
_pm_import_imported_task_match = pm_import_imported_task_match
_pm_import_equipment_linked_task_match = pm_import_equipment_linked_task_match
_pm_import_task_match = pm_import_task_match


def _scope_query(base: dict, user: dict) -> dict:
    """Apply migration-safe tenant filter to intelligence map aggregations."""
    return scoped(user, base or {})


def _scope_pipeline(pipeline: list, user: dict) -> list:
    return prepend_tenant_match(pipeline, user)


def _current_user_id(current_user: dict) -> str:
    return current_user.get("id") or current_user.get("user_id") or current_user.get("email", "unknown")


def _active_v2_program_match(base_query: Optional[dict] = None) -> dict:
    """V2 programs with at least one enabled task (not just a stale active_tasks counter)."""
    query = dict(base_query or {})
    query["status"] = {"$in": ["active", "draft"]}
    query["$or"] = [
        {"tasks": {"$elemMatch": {"is_active": {"$ne": False}}}},
        {
            "$and": [
                {"active_tasks": {"$gt": 0}},
                {
                    "$or": [
                        {"tasks": {"$exists": False}},
                        {"tasks": []},
                    ]
                },
            ]
        },
    ]
    return query


async def _count_imported_pm_import_tasks(
    user: dict,
    equipment_ids: Optional[list] = None,
    equipment_tags: Optional[list] = None,
) -> int:
    rows = await timed_aggregate(
        db.pm_import_sessions,
        _scope_pipeline([
            {"$unwind": "$tasks_extracted"},
            {"$match": _pm_import_imported_task_match(equipment_ids, equipment_tags)},
            {"$count": "c"},
        ], user),
    )
    return rows[0]["c"] if rows else 0


def _intelligence_map_schedule_query(
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
) -> dict:
    """Build scheduled_tasks filter used by intelligence map stats (equipment scope only)."""
    schedule_query: dict = {}
    if equipment_type_id:
        schedule_query["equipment_type_id"] = equipment_type_id
    if equipment_id:
        schedule_query["equipment_id"] = equipment_id
    return schedule_query


def _schedules_missing_frequency_filter(schedule_query: dict) -> dict:
    """Match scheduled_tasks with null, empty, or missing frequency."""
    return {
        **schedule_query,
        "$or": [
            {"frequency": None},
            {"frequency": ""},
            {"frequency": {"$exists": False}},
        ],
    }


_OPEN_SCHEDULED_TASK_STATUSES = ["completed", "cancelled"]
_CORRECTIVE_SCHEDULED_TASK_TYPES = ["reactive", "corrective"]


async def _count_scheduler_scoped_open_tasks(
    user: dict,
    *,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    equipment_ids: Optional[list] = None,
) -> int:
    """Count open scheduled_tasks using the same scoping as the maintenance scheduler."""
    from services.maintenance_scheduler_scope import scope_scheduled_tasks_query

    query: dict = {
        "status": {"$nin": _OPEN_SCHEDULED_TASK_STATUSES},
        "task_type": {"$nin": _CORRECTIVE_SCHEDULED_TASK_TYPES},
    }
    await scope_scheduled_tasks_query(query, equipment_type_id, user=user)

    if query.get("_id") == {"$exists": False}:
        return 0

    if equipment_id:
        query = {"$and": [query, {"equipment_id": equipment_id}]}
    elif equipment_ids is not None:
        if not equipment_ids:
            return 0
        query = {"$and": [query, {"equipment_id": {"$in": equipment_ids}}]}

    return await db.scheduled_tasks.count_documents(_scope_query(query, user))


async def _count_schedulable_program_tasks(
    *,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    equipment_ids: Optional[list] = None,
) -> tuple[int, int, int]:
    """Return (total, from_strategy, from_pm_import) schedulable task templates."""
    from models.maintenance_program import TaskSource
    from services.scheduler_program_source import load_schedulable_programs

    eq_ids = [equipment_id] if equipment_id else equipment_ids
    rows = await load_schedulable_programs(
        equipment_type_id=equipment_type_id,
        equipment_ids=eq_ids,
    )

    if equipment_ids is not None and not equipment_id:
        eq_set = set(equipment_ids)
        rows = [row for row in rows if row.get("equipment_id") in eq_set]

    from_strategy = 0
    from_pm_import = 0
    for row in rows:
        source = (row.get("task_source") or "").lower()
        if (
            row.get("program_source") == "pm_import"
            or source == TaskSource.CUSTOMER_IMPORTED.value
        ):
            from_pm_import += 1
        else:
            from_strategy += 1

    return len(rows), from_strategy, from_pm_import


def _serialize_scheduled_task_missing_frequency(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "task_name": doc.get("task_name") or "",
        "equipment_name": doc.get("equipment_name") or "",
        "equipment_tag": doc.get("equipment_tag"),
        "equipment_id": doc.get("equipment_id"),
        "status": doc.get("status"),
        "task_source": doc.get("task_source"),
        "due_date": doc.get("due_date"),
        "maintenance_program_id": doc.get("maintenance_program_id"),
    }


async def _count_active_pm_import_tasks(
    user: dict,
    equipment_ids: Optional[list] = None,
) -> int:
    rows = await timed_aggregate(
        db.pm_import_sessions,
        _scope_pipeline([
            {"$unwind": "$tasks_extracted"},
            {"$match": _pm_import_equipment_linked_task_match(equipment_ids, enabled_only=True)},
            {"$count": "c"},
        ], user),
    )
    return rows[0]["c"] if rows else 0


async def get_intelligence_map_stats(
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    show_linked_only: bool = False, *, current_user: dict
):
    """
    Get aggregated statistics for the Maintenance Intelligence Map dashboard.
    
    This endpoint provides counts and relationships for:
    - Failure Modes
    - Strategies (Equipment Type Strategies)
    - Equipment Types
    - Equipment
    - Maintenance Programs
    - Schedules
    - Planned Work (Tasks)
    - PM Imports
    
    Query Parameters:
    - plant_id: Filter by plant/installation
    - system_id: Filter by system/section
    - equipment_type_id: Filter by equipment type
    - equipment_id: Filter by specific equipment
    - show_linked_only: When true, only show records linked to selected filters
    """
    user_id = _current_user_id(current_user)
    tenant_key = tenant_id_from_user(current_user) or "legacy"

    # Build cache key
    cache_key = f"intelligence_map:{tenant_key}:{user_id}:{plant_id}:{system_id}:{equipment_type_id}:{equipment_id}:{show_linked_only}"
    
    # Check cache first (short TTL since this data can change)
    cached = cache.get_stat_entry(cache_key)
    if cached:
        return cached
    
    try:
        # Get user's installation filter data (for future use with permissions)
        _ = await installation_filter.get_user_installation_ids(current_user)
        
        # ========== EQUIPMENT TYPES ==========
        et_query = {}
        if equipment_type_id:
            et_query["id"] = equipment_type_id
            
        equipment_types_count = await count_equipment_types(db, et_query, user=current_user)
        
        # Get equipment types that are actually used in equipment
        equipment_types_in_use = await db.equipment_nodes.distinct("equipment_type_id", scoped(current_user,{
            "equipment_type_id": {"$ne": None, "$exists": True}
        }))
        equipment_types_in_use_set = set([et for et in equipment_types_in_use if et])
        equipment_types_in_use_list = list(equipment_types_in_use_set)
        
        # ========== FAILURE MODES (only those linked to equipment types in use) ==========
        # Failure modes use equipment_type_ids (array) not equipment_type_id
        if equipment_type_id:
            fm_query = {"equipment_type_ids": equipment_type_id}
        elif equipment_types_in_use_set:
            # Only count failure modes linked to equipment types actually in use
            fm_query = {"equipment_type_ids": {"$elemMatch": {"$in": equipment_types_in_use_list}}}
        else:
            fm_query = {}
        
        failure_modes_count = await db.failure_modes.count_documents(scoped(current_user,fm_query))
        
        # Get unique equipment types with failure modes (that are in use)
        # Use aggregation to unwind equipment_type_ids and find intersection
        fm_et_pipeline = [
            {"$match": {"equipment_type_ids": {"$exists": True, "$ne": []}}},
            {"$unwind": "$equipment_type_ids"},
            {"$match": {"equipment_type_ids": {"$in": equipment_types_in_use_list}}},
            {"$group": {"_id": "$equipment_type_ids"}}
        ]
        fm_et_result = await timed_aggregate(
            db.failure_modes,
            _scope_pipeline(fm_et_pipeline, current_user),
        )
        fm_equipment_types_set = set([r["_id"] for r in fm_et_result if r["_id"]])
        fm_equipment_types_count = len(fm_equipment_types_set)
        
        # Count equipment types that have failure modes AND are used in equipment
        equipment_types_with_fm_in_use_count = fm_equipment_types_count  # Same as above since we already filtered
        
        # ========== STRATEGIES (Equipment Type Strategies) ==========
        # Use equipment_type_strategies collection (what Maintenance Strategy tab shows)
        strategy_query = {}
        if equipment_type_id:
            strategy_query["equipment_type_id"] = equipment_type_id
            
        strategies_count = await db.equipment_type_strategies.count_documents(scoped(current_user,strategy_query))
        
        # Count task templates from equipment type strategies
        strategy_pipeline = [
            {"$match": scoped(current_user,strategy_query)},
            {"$group": {
                "_id": None,
                "total_task_templates": {"$sum": {"$size": {"$ifNull": ["$task_templates", []]}}}
            }}
        ]
        strategy_agg = await timed_aggregate(db.equipment_type_strategies, strategy_pipeline)
        total_task_templates = strategy_agg[0]["total_task_templates"] if strategy_agg else 0
        
        # ========== EQUIPMENT ==========
        equipment_query: dict = {}

        if equipment_type_id:
            equipment_query["equipment_type_id"] = equipment_type_id
        if equipment_id:
            equipment_query["id"] = equipment_id

        equipment_query = await apply_plant_system_filters(
            db, equipment_query, plant_id=plant_id, system_id=system_id
        )
        
        # Filter by equipment levels (not installations/plants)
        equipment_levels = ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"]
        if not equipment_query:
            equipment_query["level"] = {"$in": equipment_levels}
        else:
            equipment_query["level"] = {"$in": equipment_levels}
        
        equipment_count = await db.equipment_nodes.count_documents(scoped(current_user,equipment_query))

        pm_import_equipment_ids = None
        pm_import_equipment_tags = None
        if equipment_id:
            pm_import_equipment_ids = [equipment_id]
        elif equipment_type_id or plant_id or system_id:
            pm_import_equipment_ids = await db.equipment_nodes.distinct(
                "id",
                scoped(current_user,equipment_query),
            )
        if pm_import_equipment_ids is not None:
            raw_tags = await db.equipment_nodes.distinct(
                "tag",
                scoped(current_user,{
                    **equipment_query,
                    "tag": {"$exists": True, "$nin": [None, ""]},
                }),
            )
            pm_import_equipment_tags = [t for t in raw_tags if t and str(t).strip()]
        
        # Count equipment with assigned equipment types
        equipment_with_type_query = {**equipment_query, "equipment_type_id": {"$ne": None, "$exists": True}}
        equipment_with_type_count = await db.equipment_nodes.count_documents(scoped(current_user,equipment_with_type_query))
        
        # Get equipment types that have strategies (from equipment_type_strategies)
        strategy_equipment_types = await db.equipment_type_strategies.distinct(
            "equipment_type_id",
            scoped(current_user,{}),
        )
        strategy_equipment_types_set = set([et for et in strategy_equipment_types if et])
        
        # Count equipment affected by strategies (equipment with equipment_type that has a strategy)
        if strategy_equipment_types_set:
            equipment_with_strategy_count = await db.equipment_nodes.count_documents(scoped(current_user,{
                **equipment_query,
                "equipment_type_id": {"$in": list(strategy_equipment_types_set)}
            }))
        else:
            equipment_with_strategy_count = 0
        
        # Count equipment that have strategy APPLIED (have maintenance program with strategy tasks)
        programs_with_strategy = await db.maintenance_programs_v2.find(
            scoped(current_user,{"strategy_tasks": {"$gt": 0}}),
            {"equipment_id": 1}
        ).to_list(1000)
        equipment_ids_with_strategy_applied = set([p.get("equipment_id") for p in programs_with_strategy if p.get("equipment_id")])
        equipment_with_strategy_applied_count = len(equipment_ids_with_strategy_applied)

        # ========== EQUIPMENT WITH ACTIVE PM IMPORT TASKS ==========
        pm_task_active_match = _pm_import_equipment_linked_task_match(
            pm_import_equipment_ids,
            enabled_only=True,
        )
        pm_equipment_pipeline = [
            {"$unwind": "$tasks_extracted"},
            {"$match": pm_task_active_match},
            {"$group": {"_id": "$tasks_extracted.equipment_match.equipment_id"}},
        ]
        pm_equipment_result = await timed_aggregate(
            db.pm_import_sessions,
            _scope_pipeline(pm_equipment_pipeline, current_user),
        )
        equipment_ids_with_pm_import = set(r["_id"] for r in pm_equipment_result if r.get("_id"))

        pm_imported_tasks_count = await _count_imported_pm_import_tasks(
            current_user,
            pm_import_equipment_ids,
            pm_import_equipment_tags,
        )

        # ========== MAINTENANCE PROGRAMS ==========
        program_query = {}
        if equipment_type_id:
            program_query["equipment_type_id"] = equipment_type_id
        if equipment_id:
            program_query["equipment_id"] = equipment_id
            
        programs_count = await db.maintenance_programs_v2.count_documents(scoped(current_user,program_query))

        active_program_query = _active_v2_program_match(program_query)
        active_v2_program_count = await db.maintenance_programs_v2.count_documents(
            scoped(current_user,active_program_query),
        )
        equipment_ids_with_active_v2_program = {
            eid
            for eid in await db.maintenance_programs_v2.distinct(
                "equipment_id",
                scoped(current_user,active_program_query),
            )
            if eid
        }

        # Active programs: v2 rows with live active tasks + PM-import-only equipment (enabled tasks).
        pm_only_equipment = equipment_ids_with_pm_import - equipment_ids_with_active_v2_program
        programs_active_count = active_v2_program_count + len(pm_only_equipment)

        equipment_ids_with_active_program = (
            equipment_ids_with_active_v2_program | equipment_ids_with_pm_import
        )
        equipment_with_active_program_count = len(equipment_ids_with_active_program)
        
        # Get program task statistics
        program_pipeline = [
            {"$match": scoped(current_user,program_query)},
            {"$group": {
                "_id": None,
                "total_tasks": {"$sum": "$total_tasks"},
                "active_tasks": {"$sum": "$active_tasks"},
                "strategy_tasks": {"$sum": {"$ifNull": ["$strategy_tasks", 0]}},
                "imported_tasks": {"$sum": {"$ifNull": ["$imported_tasks", 0]}},
                "ai_tasks": {"$sum": {"$ifNull": ["$ai_tasks", 0]}},
                "manual_tasks": {"$sum": {"$ifNull": ["$manual_tasks", 0]}}
            }}
        ]
        program_agg = await timed_aggregate(db.maintenance_programs_v2, program_pipeline)
        program_stats = program_agg[0] if program_agg else {
            "total_tasks": 0, "active_tasks": 0, "strategy_tasks": 0,
            "imported_tasks": 0, "ai_tasks": 0, "manual_tasks": 0
        }
        
        # ========== SCHEDULES (Scheduled Tasks) ==========
        schedule_query = _intelligence_map_schedule_query(equipment_type_id, equipment_id)

        scoped_equipment_ids = None
        if equipment_id:
            scoped_equipment_ids = [equipment_id]
        elif plant_id or system_id or equipment_type_id:
            scoped_equipment_ids = await db.equipment_nodes.distinct(
                "id",
                scoped(current_user,equipment_query),
            )
            
        schedules_count = await db.scheduled_tasks.count_documents(scoped(current_user,schedule_query))

        # Active frequencies: schedulable program task templates (matches maintenance scheduler).
        (
            schedules_for_applied_count,
            strategy_active_tasks_total,
            pm_tasks_active_count,
        ) = await _count_schedulable_program_tasks(
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            equipment_ids=scoped_equipment_ids,
        )
        
        # Count schedules by status
        schedule_status_pipeline = [
            {"$match": scoped(current_user,schedule_query)},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        schedule_status = await timed_aggregate(db.scheduled_tasks, schedule_status_pipeline)
        schedule_by_status = {s["_id"]: s["count"] for s in schedule_status if s["_id"]}
        
        # Count schedules missing frequency
        schedules_missing_freq = await db.scheduled_tasks.count_documents(
            scoped(current_user,_schedules_missing_frequency_filter(schedule_query))
        )

        # Actual scheduled_tasks record count scoped to equipment with an active program.
        # Used by the Data Lineage Sankey so the "Schedules" node reflects the real
        # data lineage record count (not the conceptual count of task templates with
        # a frequency).
        if equipment_ids_with_active_program:
            schedules_actual_for_applied = await db.scheduled_tasks.count_documents(scoped(current_user,{
                **schedule_query,
                "equipment_id": {"$in": list(equipment_ids_with_active_program)},
            }))
        else:
            schedules_actual_for_applied = 0
        
        # ========== PLANNED WORK (Open scheduled task instances) ==========
        planned_work_count = await _count_scheduler_scoped_open_tasks(
            current_user,
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            equipment_ids=scoped_equipment_ids,
        )
        planned_work_for_applied_count = planned_work_count
        
        # ========== PM IMPORTS (Accepted tasks without failure mode linkage) ==========
        # Count accepted tasks from pm_import_sessions.tasks_extracted that don't have failure_mode_id
        pm_sessions_pipeline = [
            {"$unwind": {"path": "$tasks_extracted", "preserveNullAndEmptyArrays": False}},
            {"$match": {
                "tasks_extracted.review_status": "accepted",
                "$or": [
                    {"tasks_extracted.failure_mode_id": None},
                    {"tasks_extracted.failure_mode_id": {"$exists": False}},
                    {"tasks_extracted.failure_mode_id": ""}
                ]
            }},
            {"$count": "count"}
        ]
        pm_accepted_result = await timed_aggregate(
            db.pm_import_sessions,
            _scope_pipeline(pm_sessions_pipeline, current_user),
        )
        pm_accepted_no_fm_total = pm_accepted_result[0]["count"] if pm_accepted_result else 0
        
        # Also get session count for reference
        pm_sessions_count = await db.pm_import_sessions.count_documents(scoped(current_user,{}))
        
        # ========== CALCULATE KPIs ==========
        
        # Failure Mode Coverage: Equipment with linked failure modes / Total equipment
        # This requires checking equipment that have equipment_type_id that has failure modes
        if fm_equipment_types_set and equipment_count > 0:
            covered_equipment = await db.equipment_nodes.count_documents(scoped(current_user,{
                **equipment_query,
                "equipment_type_id": {"$in": list(fm_equipment_types_set)}
            }))
            failure_mode_coverage = round((covered_equipment / equipment_count) * 100, 1) if equipment_count > 0 else 0
        else:
            failure_mode_coverage = 0
            covered_equipment = 0
        
        # Strategy Density: Total strategies per asset
        strategy_density = round(strategies_count / equipment_count, 1) if equipment_count > 0 else 0
        
        # PM Source Split: Generated vs Imported
        imported_tasks_count = max(
            pm_imported_tasks_count,
            program_stats.get("imported_tasks", 0),
        )
        generated_tasks = (
            program_stats.get("strategy_tasks", 0)
            + program_stats.get("ai_tasks", 0)
            + program_stats.get("manual_tasks", 0)
        )
        total_pm_tasks = max(
            program_stats.get("total_tasks", 0),
            generated_tasks + imported_tasks_count,
        )
        
        if total_pm_tasks > 0:
            generated_pct = round((generated_tasks / total_pm_tasks) * 100)
            imported_pct = round((imported_tasks_count / total_pm_tasks) * 100)
        else:
            generated_pct = 0
            imported_pct = 0
        
        # Schedule Compliance: Schedules with valid frequency / Total schedules
        valid_schedules = schedules_count - schedules_missing_freq
        schedule_compliance = round((valid_schedules / schedules_count) * 100, 1) if schedules_count > 0 else 100

        reliability_edges_total = await count_active_reliability_edges(current_user)
        edges_by_relation = await count_edges_by_relation(current_user, active_only=True)

        # ========== BUILD RESPONSE ==========
        result = {
            "reliability_edges_total": reliability_edges_total,
            "reliability_edges_by_relation": edges_by_relation,
            # Main flow counts
            "failure_modes": {
                "count": failure_modes_count,
                "connected_equipment_types": fm_equipment_types_count,
                "label": "Failure Modes"
            },
            "strategies": {
                "count": strategies_count,
                "task_templates": total_task_templates,
                "equipment_type_ids": list(strategy_equipment_types_set),  # Equipment type IDs that have strategies
                "label": "Strategies"
            },
            "equipment_types": {
                "count": equipment_types_count,
                "with_strategies": strategies_count,
                "with_fm_in_use": equipment_types_with_fm_in_use_count,  # Equipment types with FM that are used in equipment
                "in_use": len(equipment_types_in_use_set),  # Total equipment types actually used
                "label": "Equipment Types"
            },
            "equipment": {
                "count": equipment_count,
                "with_type": equipment_with_type_count,
                "with_strategy": equipment_with_strategy_count,  # Equipment that could have strategy (equipment type has strategy)
                "with_strategy_applied": equipment_with_strategy_applied_count,  # Equipment with strategy applied
                "with_pm_import": len(equipment_ids_with_pm_import),  # Equipment with accepted PM Import tasks
                "with_active_program": equipment_with_active_program_count,  # Strategy applied OR PM imported
                "with_coverage": covered_equipment,
                "label": "Equipment"
            },
            "maintenance_programs": {
                "count": programs_count,
                "active": programs_active_count,  # Strategy programs + PM import driven equipment programs
                "from_pm_import": len(pm_only_equipment),  # PM-only equipment (not also from strategy)
                "total_tasks": program_stats.get("total_tasks", 0),
                "active_tasks": program_stats.get("active_tasks", 0),
                "label": "Maintenance Programs"
            },
            "schedules": {
                "count": schedules_count,
                "for_applied": schedules_for_applied_count,
                "actual_for_applied": schedules_actual_for_applied,
                "from_strategy": strategy_active_tasks_total,
                "from_pm_import": pm_tasks_active_count,
                "by_status": schedule_by_status,
                "missing_frequency": schedules_missing_freq,
                "label": "Schedules"
            },
            "planned_work": {
                "count": planned_work_count,
                "for_applied": planned_work_for_applied_count,
                "label": "Planned Work"
            },
            
            # Secondary flow (PM Imports - accepted tasks not connected to failure modes)
            "pm_imports": {
                "sessions": pm_sessions_count,
                "accepted_no_fm": pm_accepted_no_fm_total,  # Accepted PM tasks NOT connected to failure modes
                "label": "PM Imports"
            },
            
            # Relationships (for Sankey diagram)
            "relationships": {
                "fm_to_equipment_types": {
                    "source": "failure_modes",
                    "target": "equipment_types",
                    "value": len(equipment_types_in_use_set)  # Equipment types in use
                },
                "equipment_types_to_strategies": {
                    "source": "equipment_types",
                    "target": "strategies",
                    "value": strategies_count  # Strategies created from equipment types
                },
                "strategies_to_programs": {
                    "source": "strategies",
                    "target": "maintenance_programs",
                    "value": programs_count  # Programs created from strategies
                },
                "programs_to_equipment": {
                    "source": "maintenance_programs",
                    "target": "equipment",
                    "value": equipment_with_active_program_count  # Strategy applied OR PM imported
                },
                "equipment_to_schedules": {
                    "source": "equipment",
                    "target": "schedules",
                    "value": schedules_for_applied_count
                },
                "schedules_to_work": {
                    "source": "schedules",
                    "target": "planned_work",
                    "value": planned_work_for_applied_count
                },
                # PM Import flow (accepted tasks not connected to failure modes)
                "pm_to_programs": {
                    "source": "pm_imports",
                    "target": "maintenance_programs",
                    "value": pm_accepted_no_fm_total
                }
            },
            
            # KPIs / Insights
            "insights": {
                "failure_mode_coverage": {
                    "value": failure_mode_coverage,
                    "unit": "%",
                    "description": "Equipment with linked Failure Modes",
                    "numerator": covered_equipment,
                    "denominator": equipment_count,
                    "calculation": (
                        f"Equipment whose type has failure modes linked ÷ total equipment "
                        f"= {covered_equipment} ÷ {equipment_count} × 100 = {failure_mode_coverage}%"
                        if equipment_count > 0
                        else "No equipment in scope."
                    ),
                },
                "strategy_applied": {
                    "applied": equipment_with_strategy_applied_count,
                    "total": equipment_count,
                    "eligible": equipment_with_strategy_count,
                    "description": "Equipment with Strategy Applied over all equipment",
                    "calculation": (
                        f"Equipment with a maintenance program containing strategy tasks "
                        f"= {equipment_with_strategy_applied_count} of {equipment_count} total equipment"
                    ),
                },
                "strategy_density": {
                    "value": strategy_density,
                    "unit": "per asset",
                    "description": "Strategies per Equipment",
                    "calculation": (
                        f"Equipment type strategies ÷ equipment count "
                        f"= {strategies_count} ÷ {equipment_count} = {strategy_density} per asset"
                        if equipment_count > 0
                        else "No equipment in scope."
                    ),
                },
                "pm_source_split": {
                    "generated": generated_pct,
                    "imported": imported_pct,
                    "generated_count": generated_tasks,
                    "imported_count": imported_tasks_count,
                    "total_count": total_pm_tasks,
                    "unit": "%",
                    "description": "Generated vs Imported PMs",
                    "calculation": (
                        f"Generated = strategy ({program_stats.get('strategy_tasks', 0)}) + "
                        f"AI ({program_stats.get('ai_tasks', 0)}) + manual ({program_stats.get('manual_tasks', 0)}) "
                        f"= {generated_tasks}. Imported = non-rejected PM import tasks = {imported_tasks_count}. "
                        f"Total = {total_pm_tasks}. "
                        f"Generated {generated_pct}%, Imported {imported_pct}%."
                    ),
                },
                "schedule_health": {
                    "missing_frequency": schedules_missing_freq,
                    "total_schedules": schedules_count,
                    "description": "Schedules Missing Frequency",
                    "calculation": (
                        f"Scheduled tasks with null or empty frequency field "
                        f"= {schedules_missing_freq} of {schedules_count} total scheduled tasks"
                    ),
                },
                "schedule_compliance": {
                    "value": schedule_compliance,
                    "unit": "%",
                    "description": "Schedules with Valid Frequency",
                    "valid_count": valid_schedules,
                    "total_count": schedules_count,
                    "calculation": (
                        f"Schedules with a defined frequency ÷ total schedules "
                        f"= {valid_schedules} ÷ {schedules_count} × 100 = {schedule_compliance}%"
                        if schedules_count > 0
                        else "No schedules in scope — shown as 100%."
                    ),
                },
                "reliability_graph": {
                    "reliability_edges_total": reliability_edges_total,
                    "description": "Knowledge graph edges linking reliability entities",
                    "calculation": (
                        "Count of active tenant-scoped reliability graph edges "
                        f"linking failure modes, equipment, programs, tasks, and related entities = {reliability_edges_total}"
                    ),
                },
            },
            
            # Task source breakdown for programs
            "task_sources": {
                "strategy": program_stats.get("strategy_tasks", 0),
                "imported": imported_tasks_count,
                "ai": program_stats.get("ai_tasks", 0),
                "manual": program_stats.get("manual_tasks", 0),
            }
        }
        
        # Cache the result (uses default STATS_CACHE_TTL = 60 seconds)
        cache.set_stats(cache_key, result)
        
        return result
        
    except Exception:
        logger.exception("Error getting intelligence map stats")
        raise


async def get_schedules_missing_frequency(
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0, *, current_user: dict,
):
    """
    List scheduled tasks missing a frequency value.

    Uses the same equipment_type_id / equipment_id scope as GET /stats schedule counts.
    plant_id and system_id are accepted for API parity but do not narrow schedule_query.
    """
    limit = max(1, min(limit, 500))
    skip = max(0, skip)

    try:
        schedule_query = _intelligence_map_schedule_query(equipment_type_id, equipment_id)
        query = _scope_query(_schedules_missing_frequency_filter(schedule_query), current_user)

        total = await db.scheduled_tasks.count_documents(query)
        cursor = (
            db.scheduled_tasks.find(
                query,
                {
                    "id": 1,
                    "task_name": 1,
                    "equipment_name": 1,
                    "equipment_tag": 1,
                    "equipment_id": 1,
                    "status": 1,
                    "task_source": 1,
                    "due_date": 1,
                    "maintenance_program_id": 1,
                    "_id": 0,
                },
            )
            .sort([("equipment_name", 1), ("task_name", 1)])
            .skip(skip)
            .limit(limit)
        )
        docs = await cursor.to_list(limit)
        tasks = [_serialize_scheduled_task_missing_frequency(doc) for doc in docs]

        return {"tasks": tasks, "total": total, "limit": limit, "skip": skip}
    except Exception:
        logger.exception("Error listing schedules missing frequency")
        raise


async def get_intelligence_map_filters(*, current_user: dict):
    """
    Get available filter options for the Intelligence Map dashboard.
    
    Returns:
    - plants: List of plants/installations
    - systems: List of systems/sections (can be filtered by plant)
    - equipment_types: List of equipment types
    """
    try:
        # Get user's installation filter data
        installation_ids = await installation_filter.get_user_installation_ids(current_user)
        
        # Get plants (installations)
        plants_query = {"level": "installation"}
        if installation_ids:
            plants_query["id"] = {"$in": installation_ids}
        
        plants = await db.equipment_nodes.find(
            _scope_query(plants_query, current_user),
            {"id": 1, "name": 1, "_id": 0}
        ).to_list(100)
        
        # Get systems/sections
        systems = await db.equipment_nodes.find(
            _scope_query({"level": {"$in": ["section_system", "plant_unit", "system"]}}, current_user),
            {"id": 1, "name": 1, "parent_id": 1, "_id": 0}
        ).to_list(500)
        
        # Get equipment types (canonical library collection)
        equipment_types = await list_equipment_types(
            db,
            projection={"id": 1, "name": 1, "category": 1, "_id": 0},
            limit=500,
            user=current_user,
        )
        
        return {
            "plants": plants,
            "systems": systems,
            "equipment_types": equipment_types
        }
        
    except Exception:
        logger.exception("Error getting intelligence map filters")
        raise
