"""Failure mode strategy endpoints for equipment-type maintenance strategies."""
from datetime import datetime
from typing import Any, Dict

from fastapi import HTTPException

from database import db
from models.maintenance_strategy_v2 import UpdateFailureModeStrategyRequest
from services.maintenance_strategy_propagation import (
    _bump_strategy_version,
    _cancel_open_scheduled_tasks_for_failure_mode,
    _describe_fm_change,
    _toggle_programs_for_failure_mode,
    is_enable_only_fm_toggle,
)
from services.maintenance_tenant_scope import maintenance_scoped
from services.maintenance_strategy_helpers import clear_strategy_needs_apply
from services.maintenance_strategy_v2_sync import refresh_applied_equipment_timeline as _refresh_applied_equipment_timeline


async def get_failure_mode_strategies(
    equipment_type_id: str, current_user: dict
):
    """Get all failure mode strategies for an equipment type"""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
        {"_id": 0}
    )
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    return {
        "failure_mode_strategies": strategy.get("failure_mode_strategies", []),
        "total": len(strategy.get("failure_mode_strategies", []))
    }


async def update_failure_mode_strategy(
    equipment_type_id: str,
    failure_mode_id: str,
    request: UpdateFailureModeStrategyRequest, current_user: dict
):
    """Update a specific failure mode's strategy"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    fm_strategies = strategy.get("failure_mode_strategies", [])
    updated = False
    
    for i, fm in enumerate(fm_strategies):
        if fm.get("failure_mode_id") == failure_mode_id:
            if request.strategy_type is not None:
                fm_strategies[i]["strategy_type"] = request.strategy_type.value
            if request.detection_methods is not None:
                fm_strategies[i]["detection_methods"] = [m.value for m in request.detection_methods]
            if request.task_ids is not None:
                fm_strategies[i]["task_ids"] = request.task_ids
            if request.frequency_override is not None:
                fm_strategies[i]["frequency_override"] = request.frequency_override.model_dump()
            if request.enabled is not None:
                fm_strategies[i]["enabled"] = request.enabled
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Failure mode not found in strategy")
    
    # Recalculate coverage based on active failure modes
    total_fms = len(fm_strategies)
    active_fms = sum(1 for fm in fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "failure_mode_strategies": fm_strategies,
                "active_failure_modes": active_fms,
                "coverage_score": round(coverage_score, 1),
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )

    # Find the FM-strategy dict for a friendly description
    fm_dict = next(
        (fm for fm in fm_strategies if fm.get("failure_mode_id") == failure_mode_id),
        {"failure_mode_id": failure_mode_id, "failure_mode_name": "Failure mode"},
    )
    new_version = await _bump_strategy_version(
        strategy,
        changes=[_describe_fm_change(fm_dict, request)],
        user_id=current_user.get("user_id"),
    )

    fm_propagation = {}
    enable_only = is_enable_only_fm_toggle(request)
    if request.enabled is not None:
        toggled = await _toggle_programs_for_failure_mode(
            equipment_type_id, failure_mode_id, request.enabled
        )
        fm_propagation["programs_toggled"] = toggled
        if request.enabled is False:
            fm_propagation["scheduled_tasks_cancelled"] = (
                await _cancel_open_scheduled_tasks_for_failure_mode(
                    equipment_type_id, failure_mode_id
                )
            )

    schedule_refresh: Dict[str, Any] = {}
    if not enable_only:
        schedule_refresh = await _refresh_applied_equipment_timeline(
            equipment_type_id,
            user_id=current_user.get("user_id"),
        )
    else:
        await clear_strategy_needs_apply(
            equipment_type_id,
            applied_version=new_version,
        )

    return {
        "message": "Failure mode strategy updated",
        "failure_mode_id": failure_mode_id,
        "active_failure_modes": active_fms,
        "total_failure_modes": total_fms,
        "coverage_score": round(coverage_score, 1),
        "version": new_version,
        "strategy_needs_apply": not enable_only,
        "schedule_refresh": schedule_refresh,
        **fm_propagation,
    }

