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
        
        # ========== FAILURE MODES ==========
        fm_query = {}
        if equipment_type_id:
            fm_query["equipment_type_id"] = equipment_type_id
        
        failure_modes_count = await db.failure_modes.count_documents(fm_query)
        
        # Count unique equipment types with failure modes
        fm_equipment_types = await db.failure_modes.distinct("equipment_type_id", fm_query)
        fm_equipment_types_set = set([et for et in fm_equipment_types if et])
        fm_equipment_types_count = len(fm_equipment_types_set)
        
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
        
        # Count equipment types that have failure modes AND are used in equipment
        # This shows how many equipment types with FM knowledge are actually deployed
        equipment_types_with_fm_in_use = fm_equipment_types_set.intersection(equipment_types_in_use_set)
        equipment_types_with_fm_in_use_count = len(equipment_types_with_fm_in_use)
        
        # ========== STRATEGIES (Maintenance Strategies) ==========
        # Use maintenance_strategies collection (what Maintenance Strategy tab shows)
        strategy_query = {}
        if equipment_type_id:
            strategy_query["equipment_type_id"] = equipment_type_id
            
        strategies_count = await db.maintenance_strategies.count_documents(strategy_query)
        
        # Count task templates from maintenance strategies
        strategy_pipeline = [
            {"$match": strategy_query},
            {"$group": {
                "_id": None,
                "total_task_templates": {"$sum": {"$size": {"$ifNull": ["$task_templates", []]}}}
            }}
        ]
        strategy_agg = await db.maintenance_strategies.aggregate(strategy_pipeline).to_list(1)
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
        
        # ========== MAINTENANCE PROGRAMS ==========
        program_query = {}
        if equipment_type_id:
            program_query["equipment_type_id"] = equipment_type_id
        if equipment_id:
            program_query["equipment_id"] = equipment_id
            
        programs_count = await db.maintenance_programs_v2.count_documents(program_query)
        
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
        
        # ========== PM IMPORTS ==========
        pm_import_query = {"user_id": user_id}
        pm_sessions_count = await db.pm_import_sessions.count_documents(pm_import_query)
        
        # Count total imported tasks
        pm_tasks_pipeline = [
            {"$match": pm_import_query},
            {"$group": {
                "_id": None,
                "total_tasks": {"$sum": {"$size": {"$ifNull": ["$tasks", []]}}},
                "imported_count": {
                    "$sum": {
                        "$size": {
                            "$filter": {
                                "input": {"$ifNull": ["$tasks", []]},
                                "as": "task",
                                "cond": {"$eq": ["$$task.review_status", "imported"]}
                            }
                        }
                    }
                },
                "accepted_count": {
                    "$sum": {
                        "$size": {
                            "$filter": {
                                "input": {"$ifNull": ["$tasks", []]},
                                "as": "task",
                                "cond": {"$eq": ["$$task.review_status", "accepted"]}
                            }
                        }
                    }
                }
            }}
        ]
        pm_tasks_agg = await db.pm_import_sessions.aggregate(pm_tasks_pipeline).to_list(1)
        pm_stats = pm_tasks_agg[0] if pm_tasks_agg else {"total_tasks": 0, "imported_count": 0, "accepted_count": 0}
        
        # ========== CALCULATE KPIs ==========
        
        # Failure Mode Coverage: Equipment with linked failure modes / Total equipment
        # This requires checking equipment that have equipment_type_id that has failure modes
        equipment_types_with_fm = set(fm_equipment_types)
        if equipment_types_with_fm and equipment_count > 0:
            covered_equipment = await db.equipment_nodes.count_documents({
                **equipment_query,
                "equipment_type_id": {"$in": list(equipment_types_with_fm)}
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
                "with_coverage": covered_equipment,
                "label": "Equipment"
            },
            "maintenance_programs": {
                "count": programs_count,
                "total_tasks": program_stats.get("total_tasks", 0),
                "active_tasks": program_stats.get("active_tasks", 0),
                "label": "Maintenance Programs"
            },
            "schedules": {
                "count": schedules_count,
                "by_status": schedule_by_status,
                "missing_frequency": schedules_missing_freq,
                "label": "Schedules"
            },
            "planned_work": {
                "count": planned_work_count,
                "label": "Planned Work"
            },
            
            # Secondary flow (PM Imports)
            "pm_imports": {
                "sessions": pm_sessions_count,
                "total_tasks": pm_stats.get("total_tasks", 0),
                "imported": pm_stats.get("imported_count", 0),
                "accepted": pm_stats.get("accepted_count", 0),
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
                "strategies_to_equipment": {
                    "source": "strategies",
                    "target": "equipment",
                    "value": equipment_with_type_count  # Equipment with strategies applied
                },
                "equipment_to_programs": {
                    "source": "equipment",
                    "target": "maintenance_programs",
                    "value": programs_count
                },
                "programs_to_schedules": {
                    "source": "maintenance_programs",
                    "target": "schedules",
                    "value": schedules_count
                },
                "schedules_to_work": {
                    "source": "schedules",
                    "target": "planned_work",
                    "value": planned_work_count
                },
                # PM Import flow
                "pm_to_programs": {
                    "source": "pm_imports",
                    "target": "maintenance_programs",
                    "value": pm_stats.get("imported_count", 0)
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
