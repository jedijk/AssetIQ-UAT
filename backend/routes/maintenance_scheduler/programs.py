"""
Equipment Maintenance Programs:
- Apply maintenance strategy to selected equipment
- List programs (with filters)
- Programs summary per equipment type
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from database import db

logger = logging.getLogger(__name__)
from auth import get_current_user
from models.maintenance_scheduler import ApplyStrategyRequest
from services.maintenance_scheduler_sync import refresh_equipment_schedule

router = APIRouter()


@router.post("/apply-strategy/{equipment_type_id}")
async def apply_strategy_to_equipment(
    equipment_type_id: str,
    request: ApplyStrategyRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Apply maintenance strategy to selected equipment.
    Creates maintenance program records for each equipment-task combination.
    """
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

    task_templates = strategy.get("task_templates", [])

    user_id = current_user.get("id") or current_user.get("user_id")
    strategy_version = strategy.get("version", "1.0")
    equipment_ids = [e.get("id") for e in equipment_list if e.get("id")]

    from services.maintenance_program_service import MaintenanceProgramService

    v2_sync = await MaintenanceProgramService.ensure_programs_for_equipment_ids(
        equipment_ids=equipment_ids,
        strategy_version=strategy_version,
        user_id=user_id,
    )
    v2_programs_created = v2_sync.get("programs_created", 0)
    v2_programs_regenerated = v2_sync.get("programs_regenerated", 0)
    v2_errors = v2_sync.get("errors", [])

    scheduled_count = 0
    programs_created_count = 0
    pm_import_synced = 0
    for equipment in equipment_list:
        refresh = await refresh_equipment_schedule(
            equipment.get("id"),
            user_id=user_id,
        )
        scheduled_count += refresh.get("scheduled_tasks_created", 0)
        programs_created_count += refresh.get("strategy_programs_created", 0)
        pm_import_synced += refresh.get("pm_import_programs_synced", 0)

    from routes.maintenance_strategy_v2 import _resync_programs_with_strategy
    resync = await _resync_programs_with_strategy(equipment_type_id)

    return {
        "message": f"Strategy applied to {len(equipment_list)} equipment",
        "equipment_count": len(equipment_list),
        "programs_created": programs_created_count,
        "programs_updated": len(equipment_list) * len(task_templates) - programs_created_count,
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
    }


@router.get("/programs")
async def get_maintenance_programs(
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    is_active: bool = True,
    current_user: dict = Depends(get_current_user),
):
    """Get all maintenance programs with optional filtering."""
    query = {"is_active": is_active}

    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    if equipment_id:
        query["equipment_id"] = equipment_id

    programs = await db.maintenance_programs.find(query, {"_id": 0}).to_list(1000)

    return {"programs": programs, "total": len(programs)}


@router.get("/programs/{equipment_type_id}/summary")
async def get_programs_summary(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get summary of maintenance programs for an equipment type."""
    pipeline = [
        {"$match": {"equipment_type_id": equipment_type_id, "is_active": True}},
        {"$group": {
            "_id": "$equipment_id",
            "equipment_name": {"$first": "$equipment_name"},
            "equipment_tag": {"$first": "$equipment_tag"},
            "task_count": {"$sum": 1},
        }},
    ]

    equipment_summary = await db.maintenance_programs.aggregate(pipeline).to_list(500)

    total_programs = await db.maintenance_programs.count_documents({
        "equipment_type_id": equipment_type_id,
        "is_active": True,
    })

    today = datetime.utcnow().date().isoformat()
    overdue_count = await db.maintenance_programs.count_documents({
        "equipment_type_id": equipment_type_id,
        "is_active": True,
        "next_due_date": {"$lt": today},
    })

    return {
        "equipment_count": len(equipment_summary),
        "total_programs": total_programs,
        "overdue_count": overdue_count,
        "equipment": equipment_summary,
    }
