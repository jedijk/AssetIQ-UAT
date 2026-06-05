"""
Intelligence Map Routes
API endpoints for the Maintenance Intelligence Map Dashboard

The Intelligence Map provides a visual representation of how AssetIQ transforms 
reliability knowledge into maintenance execution.

Flow: Failure Modes → Strategies → Equipment Types → Equipment → 
      Maintenance Programs → Schedules → Planned Work

Secondary Flow (PM Imports):
PM Imports → Maintenance Programs → Schedules → Planned Work
"""

from fastapi import APIRouter, Depends
from typing import Optional
import logging

from database import db, installation_filter
from auth import get_current_user
from services.cache_service import cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intelligence-map", tags=["Intelligence Map"])


def _current_user_id(current_user: dict) -> str:
    return current_user.get("id") or current_user.get("user_id") or current_user.get("email", "unknown")


@router.get("/stats")
async def get_intelligence_map_stats(
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    show_linked_only: bool = False,
    current_user: dict = Depends(get_current_user)
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
    
    # Build cache key
    cache_key = f"intelligence_map:{user_id}:{plant_id}:{system_id}:{equipment_type_id}:{equipment_id}:{show_linked_only}"
    
    # Check cache first (short TTL since this data can change)
    cached = cache.get_stats(cache_key)
    if cached:
        return cached
    
    try:
        # Get user's installation filter data (for future use with permissions)
        _ = await installation_filter.get_user_installation_ids(current_user)
        
        # ========== EQUIPMENT TYPES ==========
        et_query = {}
        if equipment_type_id:
            et_query["id"] = equipment_type_id
            
        equipment_types_count = await db.equipment_types.count_documents(et_query)
        
        # Get equipment types that are actually used in equipment
        equipment_types_in_use = await db.equipment_nodes.distinct("equipment_type_id", {
            "equipment_type_id": {"$ne": None, "$exists": True}
        })
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
        
        failure_modes_count = await db.failure_modes.count_documents(fm_query)
        
        # Get unique equipment types with failure modes (that are in use)
        # Use aggregation to unwind equipment_type_ids and find intersection
        fm_et_pipeline = [
            {"$match": {"equipment_type_ids": {"$exists": True, "$ne": []}}},
            {"$unwind": "$equipment_type_ids"},
            {"$match": {"equipment_type_ids": {"$in": equipment_types_in_use_list}}},
            {"$group": {"_id": "$equipment_type_ids"}}
        ]
        fm_et_result = await db.failure_modes.aggregate(fm_et_pipeline).to_list(1000)
        fm_equipment_types_set = set([r["_id"] for r in fm_et_result if r["_id"]])
        fm_equipment_types_count = len(fm_equipment_types_set)
        
        # Count equipment types that have failure modes AND are used in equipment
        equipment_types_with_fm_in_use_count = fm_equipment_types_count  # Same as above since we already filtered
        
        # ========== STRATEGIES (Equipment Type Strategies) ==========
        # Use equipment_type_strategies collection (what Maintenance Strategy tab shows)
        strategy_query = {}
        if equipment_type_id:
            strategy_query["equipment_type_id"] = equipment_type_id
            
        strategies_count = await db.equipment_type_strategies.count_documents(strategy_query)
        
        # Count task templates from equipment type strategies
        strategy_pipeline = [
            {"$match": strategy_query},
            {"$group": {
                "_id": None,
                "total_task_templates": {"$sum": {"$size": {"$ifNull": ["$task_templates", []]}}}
            }}
        ]
        strategy_agg = await db.equipment_type_strategies.aggregate(strategy_pipeline).to_list(1)
        total_task_templates = strategy_agg[0]["total_task_templates"] if strategy_agg else 0
        
        # ========== EQUIPMENT ==========
        equipment_query = {}
        
        # Apply hierarchy filters
        if plant_id:
            # Get all equipment under this plant
            equipment_query["$or"] = [
                {"installation_id": plant_id},
                {"parent_path": {"$regex": f".*{plant_id}.*"}}
            ]
        if system_id:
            equipment_query["$or"] = [
                {"parent_id": system_id},
                {"parent_path": {"$regex": f".*{system_id}.*"}}
            ]
        if equipment_type_id:
            equipment_query["equipment_type_id"] = equipment_type_id
        if equipment_id:
            equipment_query["id"] = equipment_id
        
        # Filter by equipment levels (not installations/plants)
        equipment_levels = ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"]
        if not equipment_query:
            equipment_query["level"] = {"$in": equipment_levels}
        else:
            equipment_query["level"] = {"$in": equipment_levels}
        
        equipment_count = await db.equipment_nodes.count_documents(equipment_query)
        
        # Count equipment with assigned equipment types
        equipment_with_type_query = {**equipment_query, "equipment_type_id": {"$ne": None, "$exists": True}}
        equipment_with_type_count = await db.equipment_nodes.count_documents(equipment_with_type_query)
        
        # Get equipment types that have strategies (from equipment_type_strategies)
        strategy_equipment_types = await db.equipment_type_strategies.distinct("equipment_type_id")
        strategy_equipment_types_set = set([et for et in strategy_equipment_types if et])
        
        # Count equipment affected by strategies (equipment with equipment_type that has a strategy)
        if strategy_equipment_types_set:
            equipment_with_strategy_count = await db.equipment_nodes.count_documents({
                **equipment_query,
                "equipment_type_id": {"$in": list(strategy_equipment_types_set)}
            })
        else:
            equipment_with_strategy_count = 0
        
        # Count equipment that have strategy APPLIED (have maintenance program with strategy tasks)
        programs_with_strategy = await db.maintenance_programs_v2.find(
            {"strategy_tasks": {"$gt": 0}},
            {"equipment_id": 1}
        ).to_list(1000)
        equipment_ids_with_strategy_applied = set([p.get("equipment_id") for p in programs_with_strategy if p.get("equipment_id")])
        equipment_with_strategy_applied_count = len(equipment_ids_with_strategy_applied)

        # ========== EQUIPMENT WITH ACCEPTED PM IMPORT TASKS ==========
        # Pull distinct equipment ids from accepted PM import tasks. These count as
        # equipment with an active program too (PM import → program).
        pm_equipment_pipeline = [
            {"$unwind": "$tasks_extracted"},
            {"$match": {
                "tasks_extracted.review_status": "accepted",
                "tasks_extracted.equipment_match.equipment_id": {"$ne": None},
            }},
            {"$group": {"_id": "$tasks_extracted.equipment_match.equipment_id"}},
        ]
        pm_equipment_result = await db.pm_import_sessions.aggregate(pm_equipment_pipeline).to_list(1000)
        equipment_ids_with_pm_import = set(r["_id"] for r in pm_equipment_result if r.get("_id"))

        # Count accepted PM tasks (each one is effectively an "active program" entry
        # contributed by PM Import). Used to inflate the Programs / Schedules KPIs.
        pm_tasks_active_count = await db.pm_import_sessions.aggregate([
            {"$unwind": "$tasks_extracted"},
            {"$match": {"tasks_extracted.review_status": "accepted"}},
            {"$count": "c"},
        ]).to_list(1)
        pm_tasks_active_count = pm_tasks_active_count[0]["c"] if pm_tasks_active_count else 0

        # Combined: equipment with any "active program" (strategy applied OR PM imported)
        equipment_ids_with_active_program = (
            equipment_ids_with_strategy_applied | equipment_ids_with_pm_import
        )
        equipment_with_active_program_count = len(equipment_ids_with_active_program)
        
        # ========== MAINTENANCE PROGRAMS ==========
        program_query = {}
        if equipment_type_id:
            program_query["equipment_type_id"] = equipment_type_id
        if equipment_id:
            program_query["equipment_id"] = equipment_id
            
        programs_count = await db.maintenance_programs_v2.count_documents(program_query)

        # Active programs include both strategy-applied programs and PM Import-driven ones.
        # When a program comes from PM Import, the v2 row may not exist yet — so we count
        # the distinct equipment with PM imports as additional "active programs".
        # programs_active = strategy programs + PM import equipment not already counted.
        pm_only_equipment = equipment_ids_with_pm_import - equipment_ids_with_strategy_applied
        programs_active_count = programs_count + len(pm_only_equipment)
        
        # Get program task statistics
        program_pipeline = [
            {"$match": program_query},
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
        program_agg = await db.maintenance_programs_v2.aggregate(program_pipeline).to_list(1)
        program_stats = program_agg[0] if program_agg else {
            "total_tasks": 0, "active_tasks": 0, "strategy_tasks": 0,
            "imported_tasks": 0, "ai_tasks": 0, "manual_tasks": 0
        }
        
        # ========== SCHEDULES (Scheduled Tasks) ==========
        schedule_query = {}
        if equipment_type_id:
            schedule_query["equipment_type_id"] = equipment_type_id
        if equipment_id:
            schedule_query["equipment_id"] = equipment_id
            
        schedules_count = await db.scheduled_tasks.count_documents(schedule_query)

        # Scoped count: number of TASKS (program task templates) that have a schedule
        # — strategy-driven active tasks PLUS accepted PM import tasks
        # (each PM import accepted task contributes one task with a schedule frequency).
        if equipment_ids_with_strategy_applied:
            applied_programs_agg = await db.maintenance_programs_v2.aggregate([
                {"$match": {"equipment_id": {"$in": list(equipment_ids_with_strategy_applied)}}},
                {"$group": {
                    "_id": None,
                    "active_tasks": {"$sum": {"$ifNull": ["$active_tasks", 0]}},
                }},
            ]).to_list(1)
            strategy_active_tasks_total = (
                applied_programs_agg[0]["active_tasks"] if applied_programs_agg else 0
            )
        else:
            strategy_active_tasks_total = 0
        schedules_for_applied_count = strategy_active_tasks_total + pm_tasks_active_count
        
        # Count schedules by status
        schedule_status_pipeline = [
            {"$match": schedule_query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        schedule_status = await db.scheduled_tasks.aggregate(schedule_status_pipeline).to_list(10)
        schedule_by_status = {s["_id"]: s["count"] for s in schedule_status if s["_id"]}
        
        # Count schedules missing frequency
        schedules_missing_freq = await db.scheduled_tasks.count_documents({
            **schedule_query,
            "$or": [
                {"frequency": None},
                {"frequency": ""},
                {"frequency": {"$exists": False}}
            ]
        })
        
        # ========== PLANNED WORK (Future Tasks) ==========
        # today can be used for filtering due_date > today if needed
        planned_work_query = {
            **schedule_query,
            "status": {"$nin": ["completed", "cancelled"]},
        }
        planned_work_count = await db.scheduled_tasks.count_documents(planned_work_query)

        # Scoped count: planned work for equipment with an active program
        # (strategy applied OR PM imported).
        if equipment_ids_with_active_program:
            planned_work_for_applied_count = await db.scheduled_tasks.count_documents({
                **planned_work_query,
                "equipment_id": {"$in": list(equipment_ids_with_active_program)},
            })
        else:
            planned_work_for_applied_count = 0
        
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
        pm_accepted_result = await db.pm_import_sessions.aggregate(pm_sessions_pipeline).to_list(1)
        pm_accepted_no_fm_total = pm_accepted_result[0]["count"] if pm_accepted_result else 0
        
        # Also get session count for reference
        pm_sessions_count = await db.pm_import_sessions.count_documents({})
        
        # ========== CALCULATE KPIs ==========
        
        # Failure Mode Coverage: Equipment with linked failure modes / Total equipment
        # This requires checking equipment that have equipment_type_id that has failure modes
        if fm_equipment_types_set and equipment_count > 0:
            covered_equipment = await db.equipment_nodes.count_documents({
                **equipment_query,
                "equipment_type_id": {"$in": list(fm_equipment_types_set)}
            })
            failure_mode_coverage = round((covered_equipment / equipment_count) * 100, 1) if equipment_count > 0 else 0
        else:
            failure_mode_coverage = 0
            covered_equipment = 0
        
        # Strategy Density: Total strategies per asset
        strategy_density = round(strategies_count / equipment_count, 1) if equipment_count > 0 else 0
        
        # PM Source Split: Generated vs Imported
        total_pm_tasks = program_stats.get("total_tasks", 0)
        generated_tasks = program_stats.get("strategy_tasks", 0) + program_stats.get("ai_tasks", 0) + program_stats.get("manual_tasks", 0)
        pm_imported_tasks = program_stats.get("imported_tasks", 0)
        
        if total_pm_tasks > 0:
            generated_pct = round((generated_tasks / total_pm_tasks) * 100)
            imported_pct = round((pm_imported_tasks / total_pm_tasks) * 100)
        else:
            generated_pct = 0
            imported_pct = 0
        
        # Schedule Compliance: Schedules with valid frequency / Total schedules
        valid_schedules = schedules_count - schedules_missing_freq
        schedule_compliance = round((valid_schedules / schedules_count) * 100, 1) if schedules_count > 0 else 100
        
        # ========== BUILD RESPONSE ==========
        result = {
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
                    "denominator": equipment_count
                },
                "strategy_applied": {
                    "applied": equipment_with_strategy_applied_count,
                    "total": equipment_with_strategy_count,
                    "description": "Equipment with Strategy Applied"
                },
                "strategy_density": {
                    "value": strategy_density,
                    "unit": "per asset",
                    "description": "Strategies per Equipment"
                },
                "pm_source_split": {
                    "generated": generated_pct,
                    "imported": imported_pct,
                    "unit": "%",
                    "description": "Generated vs Imported PMs"
                },
                "schedule_health": {
                    "missing_frequency": schedules_missing_freq,
                    "description": "Schedules Missing Frequency"
                },
                "schedule_compliance": {
                    "value": schedule_compliance,
                    "unit": "%",
                    "description": "Schedules with Valid Frequency"
                }
            },
            
            # Task source breakdown for programs
            "task_sources": {
                "strategy": program_stats.get("strategy_tasks", 0),
                "imported": program_stats.get("imported_tasks", 0),
                "ai": program_stats.get("ai_tasks", 0),
                "manual": program_stats.get("manual_tasks", 0)
            }
        }
        
        # Cache the result (uses default STATS_CACHE_TTL = 60 seconds)
        cache.set_stats(cache_key, result)
        
        return result
        
    except Exception:
        logger.exception("Error getting intelligence map stats")
        raise


@router.get("/filters")
async def get_intelligence_map_filters(
    current_user: dict = Depends(get_current_user)
):
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
            plants_query,
            {"id": 1, "name": 1, "_id": 0}
        ).to_list(100)
        
        # Get systems/sections
        systems = await db.equipment_nodes.find(
            {"level": {"$in": ["section_system", "plant_unit", "system"]}},
            {"id": 1, "name": 1, "parent_id": 1, "_id": 0}
        ).to_list(500)
        
        # Get equipment types
        equipment_types = await db.equipment_types.find(
            {},
            {"id": 1, "name": 1, "category": 1, "_id": 0}
        ).to_list(500)
        
        return {
            "plants": plants,
            "systems": systems,
            "equipment_types": equipment_types
        }
        
    except Exception:
        logger.exception("Error getting intelligence map filters")
        raise
