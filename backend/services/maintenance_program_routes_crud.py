"""Maintenance program routes — program CRUD."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException

from database import db
from models.maintenance_program import CreateMaintenanceProgramRequest
from services.maintenance_program_routes_helpers import (
    current_user_id,
    refresh_equipment_schedule_after_change,
)
from services.maintenance_program_service import MaintenanceProgramService
from services.maintenance_tenant_scope import maintenance_scoped

logger = logging.getLogger(__name__)


async def list_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0, *, current_user: dict
):
    """
    List all maintenance programs with optional filtering.

    Query Parameters:
    - equipment_type_id: Filter by equipment type
    - status: Filter by program status (draft, active, archived)
    - search: Search by equipment name or program name
    - limit: Maximum results (default 100, max 500)
    - offset: Pagination offset
    """
    query = {}

    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    if status:
        query["status"] = status

    programs = await db.maintenance_programs_v2.find(
        maintenance_scoped(current_user, query), {"_id": 0}
    ).skip(offset).limit(limit).to_list(limit)

    if search:
        search_lower = search.lower()
        programs = [
            p for p in programs
            if search_lower in p.get("equipment_name", "").lower()
            or search_lower in p.get("program_name", "").lower()
            or search_lower in (p.get("equipment_tag") or "").lower()
        ]

    total = await db.maintenance_programs_v2.count_documents(maintenance_scoped(current_user, query))

    return {
        "programs": programs,
        "total": total,
        "limit": limit,
        "offset": offset
    }


async def get_programs_summary(
    equipment_type_id: Optional[str] = None, *, current_user: dict
):
    """Get summary statistics for maintenance programs."""
    match_query = {}
    if equipment_type_id:
        match_query["equipment_type_id"] = equipment_type_id

    from services.tenant_schema import prepend_tenant_match

    pipeline = prepend_tenant_match([
        {"$match": match_query},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_tasks": {"$sum": "$total_tasks"},
            "active_tasks": {"$sum": "$active_tasks"},
            "strategy_tasks": {"$sum": "$strategy_tasks"},
            "imported_tasks": {"$sum": "$imported_tasks"},
            "ai_tasks": {"$sum": "$ai_tasks"},
            "manual_tasks": {"$sum": "$manual_tasks"}
        }}
    ], current_user)

    results = await db.maintenance_programs_v2.aggregate(pipeline).to_list(10)

    summary = {
        "total_programs": 0,
        "by_status": {},
        "task_totals": {
            "total": 0,
            "active": 0,
            "strategy": 0,
            "imported": 0,
            "ai": 0,
            "manual": 0
        }
    }

    for row in results:
        status = row["_id"] or "unknown"
        summary["by_status"][status] = row["count"]
        summary["total_programs"] += row["count"]
        summary["task_totals"]["total"] += row["total_tasks"]
        summary["task_totals"]["active"] += row["active_tasks"]
        summary["task_totals"]["strategy"] += row["strategy_tasks"]
        summary["task_totals"]["imported"] += row["imported_tasks"]
        summary["task_totals"]["ai"] += row["ai_tasks"]
        summary["task_totals"]["manual"] += row["manual_tasks"]

    return summary


async def get_maintenance_program(
    equipment_id: str, current_user: dict
):
    """
    Get the maintenance program for a specific equipment item.
    Returns program details including all tasks.
    """
    stored_program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped(current_user, {"equipment_id": equipment_id}),
        {"_id": 0}
    )

    user_id = current_user.get("id", current_user.get("email", "unknown"))
    program, has_stored_program, pm_added = (
        await MaintenanceProgramService.enrich_program_response_with_pm_import(
            stored_program,
            equipment_id,
            user_id=user_id,
        )
    )

    if not program:
        return {
            "program": None,
            "exists": False,
            "equipment_id": equipment_id,
            "pm_import_tasks_included": 0,
            "strategy_tasks_included": 0,
        }

    program, strategy_added = (
        await MaintenanceProgramService.enrich_program_response_with_strategy_tasks(
            program,
            equipment_id,
            user_id=user_id,
        )
    )

    equipment = await db.equipment_nodes.find_one(
        maintenance_scoped(current_user, {"id": equipment_id}),
        {"_id": 0, "name": 1, "tag": 1, "criticality": 1, "equipment_type_name": 1, "equipment_type_id": 1}
    )

    strategy = None
    equipment_type_id = program.get("equipment_type_id") or (equipment or {}).get("equipment_type_id")
    if equipment_type_id:
        strategy = await db.equipment_type_strategies.find_one(
            maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
            {"version": 1, "_id": 0}
        )

    program = await MaintenanceProgramService.enrich_criticality_context(
        program, equipment=equipment, strategy=strategy
    )

    strategy_update_available = False
    if strategy:
        current_sync_version = program.get("applied_strategy_version") or program.get("source_strategy_version", "0.0")
        latest_version = program.get("latest_strategy_version", "1.0")
        strategy_update_available = current_sync_version != latest_version

    return {
        "program": program,
        "exists": has_stored_program,
        "equipment_id": equipment_id,
        "strategy_update_available": strategy_update_available,
        "pm_import_tasks_included": pm_added,
        "strategy_tasks_included": strategy_added,
        "has_tasks": len(program.get("tasks") or []) > 0,
    }


async def create_maintenance_program(
    equipment_id: str,
    request: CreateMaintenanceProgramRequest, current_user: dict,
):
    """
    Create or initialize a maintenance program for an equipment item.

    Options:
    - generate_from_strategy: Auto-generate tasks from equipment type strategy
    - include_ai_recommendations: Generate AI recommendations
    """
    existing = await db.maintenance_programs_v2.find_one(
        maintenance_scoped(current_user, {"equipment_id": equipment_id})
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Maintenance program already exists for this equipment"
        )

    try:
        program = await MaintenanceProgramService.get_or_create_program(
            equipment_id=equipment_id,
            generate_from_strategy=request.generate_from_strategy,
            user_id=current_user_id(current_user)
        )

        ai_recommendations = []
        if request.include_ai_recommendations:
            try:
                ai_recommendations = await MaintenanceProgramService.generate_ai_recommendations(
                    equipment_id=equipment_id,
                    user_id=current_user_id(current_user),
                    user=current_user,
                )
            except Exception as e:
                logger.warning(f"AI recommendations failed: {e}")

        schedule_refresh = await refresh_equipment_schedule_after_change(
            equipment_id, current_user
        )

        return {
            "message": "Maintenance program created",
            "program": program.model_dump(),
            "ai_recommendations": [r.model_dump() for r in ai_recommendations],
            "schedule_refresh": schedule_refresh,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


async def delete_maintenance_program(
    equipment_id: str, current_user: dict,
):
    """
    Delete a maintenance program.
    This will also cancel any scheduled tasks associated with this program.
    """
    from services.maintenance_scheduler_sync import clear_equipment_schedule_after_program_delete

    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped(current_user, {"equipment_id": equipment_id})
    )
    if not program:
        raise HTTPException(status_code=404, detail="Maintenance program not found")

    schedule_refresh = await clear_equipment_schedule_after_program_delete(equipment_id)

    await db.maintenance_programs_v2.delete_one({"equipment_id": equipment_id})

    await MaintenanceProgramService._log_audit(
        action="delete_program",
        equipment_id=equipment_id,
        user_id=current_user_id(current_user)
    )

    return {
        "message": "Maintenance program deleted",
        "equipment_id": equipment_id,
        "scheduled_tasks_cancelled": schedule_refresh.get("scheduled_tasks_cancelled", 0),
        "legacy_programs_deactivated": schedule_refresh.get("legacy_programs_deactivated", 0),
        "schedule_refresh": schedule_refresh,
    }
