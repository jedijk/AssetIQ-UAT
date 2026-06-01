"""
Equipment Maintenance Programs:
- Apply maintenance strategy to selected equipment
- List programs (with filters)
- Programs summary per equipment type
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from database import db
from auth import get_current_user
from models.maintenance_scheduler import (
    EquipmentMaintenanceProgram,
    CriticalityLevel,
    ApplyStrategyRequest,
)
from ._shared import frequency_to_days

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
    failure_mode_strategies = strategy.get("failure_mode_strategies", [])

    # Build reverse map: task_template_id -> first FM-strategy that references it.
    # This is the source of truth — each strategy mints its own FM-strategy ids
    # distinct from the library FM ids stored inside task.failure_mode_ids.
    task_to_fm = {}
    for fm in failure_mode_strategies:
        for tid in (fm.get("task_ids") or []):
            task_to_fm.setdefault(tid, fm)

    programs_created = []
    today = datetime.utcnow().date().isoformat()

    for equipment in equipment_list:
        equipment_id = equipment.get("id")
        equipment_name = equipment.get("name")
        equipment_tag = equipment.get("tag")

        # Equipment criticality may be a dict {level: ...} or a string.
        # When criticality is not assessed yet, treat the equipment as LOW
        # so it receives the most conservative (longest-interval) frequency.
        equip_criticality = "low"
        if equipment.get("criticality"):
            crit = equipment["criticality"]
            if isinstance(crit, dict):
                level = crit.get("level")
                equip_criticality = level.lower() if level else "low"
            elif isinstance(crit, str):
                equip_criticality = crit.lower()

        for task in task_templates:
            if not task.get("is_mandatory", True):
                continue

            task_type = task.get("task_type", "preventive")
            # CM / Corrective / Reactive tasks are triggered on failure, not
            # scheduled. They never become maintenance programs.
            if task_type in ("reactive", "corrective"):
                continue

            task_id = task.get("id")
            task_name = task.get("name")

            freq_matrix = task.get("frequency_matrix", {})
            frequency = freq_matrix.get(equip_criticality, "monthly")

            fm_name = None
            fm_id = None
            fm_for_task = task_to_fm.get(task_id)
            if fm_for_task:
                fm_id = fm_for_task.get("failure_mode_id")
                fm_name = fm_for_task.get("failure_mode_name")

            existing = await db.maintenance_programs.find_one({
                "equipment_id": equipment_id,
                "task_template_id": task_id,
            })

            if existing:
                await db.maintenance_programs.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "strategy_version": strategy.get("version", "1.0"),
                        "frequency": frequency,
                        "frequency_days": frequency_to_days(frequency),
                        "criticality": equip_criticality,
                        "is_active": True,
                        "failure_mode_id": fm_id,
                        "failure_mode_name": fm_name,
                        "updated_at": datetime.utcnow().isoformat(),
                    }},
                )
            else:
                program = EquipmentMaintenanceProgram(
                    equipment_id=equipment_id,
                    equipment_name=equipment_name,
                    equipment_tag=equipment_tag,
                    equipment_type_id=equipment_type_id,
                    equipment_type_name=strategy.get("equipment_type_name", ""),
                    task_template_id=task_id,
                    task_name=task_name,
                    task_description=task.get("description"),
                    task_type=task_type,
                    frequency=frequency,
                    frequency_days=frequency_to_days(frequency),
                    criticality=CriticalityLevel(equip_criticality),
                    estimated_duration_hours=task.get("duration_hours", 1.0),
                    next_due_date=today,
                    strategy_id=strategy.get("equipment_type_id"),
                    strategy_version=strategy.get("version", "1.0"),
                    failure_mode_id=fm_id,
                    failure_mode_name=fm_name,
                    discipline=task.get("discipline"),
                    skills_required=task.get("skills_required", []),
                )

                await db.maintenance_programs.insert_one(program.model_dump())
                programs_created.append(program.id)

    # Resync active state for all programs of this equipment type so disabled
    # FMs / non-mandatory tasks immediately propagate to the newly-created ones.
    from routes.maintenance_strategy_v2 import _resync_programs_with_strategy
    resync = await _resync_programs_with_strategy(equipment_type_id)

    # Auto-generate scheduled task occurrences for the just-applied programs
    # so the calendar/Gantt shows recurring tasks immediately (no manual
    # "Run Scheduler" needed).
    from routes.maintenance_scheduler.scheduler import schedule_programs_for_equipment
    scheduled_count = await schedule_programs_for_equipment(request.equipment_ids)

    return {
        "message": f"Strategy applied to {len(equipment_list)} equipment",
        "equipment_count": len(equipment_list),
        "programs_created": len(programs_created),
        "programs_updated": len(equipment_list) * len(task_templates) - len(programs_created),
        "scheduled_tasks_created": scheduled_count,
        "programs_deactivated_on_resync": resync["programs_deactivated"],
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
