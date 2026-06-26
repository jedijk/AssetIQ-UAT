"""Maintenance strategy v2 — equipment type strategy management (service layer)."""
from fastapi import HTTPException
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from database import db
from models.maintenance_strategy_v2 import (
    EquipmentTypeStrategy,
    FailureModeStrategy,
    MaintenanceTaskTemplate,
    CriticalityFrequency,
    GeneratedTask,
    EquipmentStrategyInstance,
    CreateEquipmentTypeStrategyRequest,
    UpdateEquipmentTypeStrategyRequest,
    GenerateTasksRequest,
    UpdateFailureModeStrategyRequest,
    AddTaskTemplateRequest,
    RegenerateStrategyRequest,
    CriticalityLevel,
    MaintenanceStrategyType,
    TaskFrequency,
    DetectionMethod,
    TaskActivationState,
)

from services.maintenance_tenant_scope import maintenance_scoped
from services.maintenance_scheduler_sync import (
    clear_equipment_type_schedule_after_strategy_delete,
)
from services.maintenance_strategy_propagation import (
    _describe_fm_change,
    _bump_strategy_version,
    _toggle_programs_for_failure_mode,
    _cancel_open_scheduled_tasks_for_failure_mode,
    _apply_strategy_disable_to_programs_and_schedules,
    count_active_programs_for_strategy,
    count_open_scheduled_tasks_for_strategy,
    is_enable_only_fm_toggle,
    is_status_only_strategy_update,
)
from services.maintenance_strategy_v2_task_templates import (
    add_task_template,
    delete_task_template,
    get_task_template_program_impact,
    get_task_templates,
    update_task_template,
)
from services.maintenance_strategy_helpers import (
    calculate_frequency_for_criticality,
    get_failure_modes_for_equipment_type,
    map_detection_methods,
    determine_strategy_type,
    determine_action_type_from_text,
    generate_default_tasks_for_failure_mode,
    refresh_failure_mode_strategy_from_library,
    lookup_library_failure_mode,
    log_strategy_audit,
    enrich_strategy_needs_apply,
    clear_strategy_needs_apply,
    coerce_fm_library_version,
    strip_fm_enrichment_fields,
    normalize_fm_id,
    fm_strategy_row_matches_id,
    library_fm_matches_strategy_row,
)

from services.maintenance_strategy_v2_sync import (
    refresh_applied_equipment_timeline as _refresh_applied_equipment_timeline,
    sync_equipment_type_strategy,
)
from services.maintenance_strategy_v2_fm_strategy import (
    get_failure_mode_strategies,
    update_failure_mode_strategy,
)
from services.maintenance_strategy_v2_instances import (
    add_local_task,
    delete_local_task,
    disable_failure_mode_for_equipment,
    enable_failure_mode_for_equipment,
    generate_tasks_for_equipment,
    get_equipment_strategy_instance,
    get_equipment_sync_status,
    override_equipment_task,
    regenerate_equipment_tasks,
)

logger = logging.getLogger(__name__)


# ============= Equipment Type Strategy Endpoints =============

async def list_equipment_type_strategies(
    equipment_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None, *, current_user: dict
):
    """List all equipment type strategies"""
    query = {}
    
    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    if status:
        query["status"] = status
    
    strategies = await db.equipment_type_strategies.find(
        maintenance_scoped(current_user, query), {"_id": 0}
    ).to_list(500)
    
    # Apply search filter
    if search:
        search_lower = search.lower()
        strategies = [
            s for s in strategies
            if search_lower in s.get("equipment_type_name", "").lower()
            or search_lower in s.get("description", "").lower()
        ]
    
    return {
        "strategies": strategies,
        "total": len(strategies)
    }


async def get_equipment_type_strategy(
    equipment_type_id: str, current_user: dict
):
    """Get strategy for a specific equipment type"""
    strategy = await db.equipment_type_strategies.find_one(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
        {"_id": 0}
    )
    
    if not strategy:
        # Return empty response (not error) so UI can show "Create Strategy" button
        return {
            "strategy": None,
            "equipment_type_id": equipment_type_id,
            "exists": False
        }
    
    # Enrich failure mode strategies with potential_effects from library if missing
    # Also check for version updates
    fm_strategies = strategy.get("failure_mode_strategies", [])
    needs_effects_backfill = False
    effects_backfill: List[Dict[str, Any]] = []
    
    for fm_strategy in fm_strategies:
        fm_id = fm_strategy.get("failure_mode_id")
        fm_name = fm_strategy.get("failure_mode_name")
        
        # Search for the failure mode in the library
        library_fm = await lookup_library_failure_mode(fm_id, fm_name)
        
        if library_fm:
            # Check if potential_effects is missing or empty
            if not fm_strategy.get("potential_effects") and library_fm.get("potential_effects"):
                fm_strategy["potential_effects"] = library_fm["potential_effects"]
                needs_effects_backfill = True
                effects_backfill.append({
                    "failure_mode_id": fm_id,
                    "potential_effects": library_fm["potential_effects"],
                })
            
            # Add current library version info for comparison
            library_version = coerce_fm_library_version(library_fm.get("version") or 1)
            library_updated_at = library_fm.get("updated_at")
            if library_updated_at:
                library_updated_at = str(library_updated_at)
            
            # Get strategy's FM version (handle None explicitly)
            strategy_fm_version = coerce_fm_library_version(fm_strategy.get("fm_version"))
            
            # Add version info to the response
            fm_strategy["library_version"] = library_version
            fm_strategy["library_updated_at"] = library_updated_at
            fm_strategy["has_new_version"] = library_version > strategy_fm_version
            # Also set fm_version to 1 if it was None for display purposes
            if fm_strategy.get("fm_version") is None:
                fm_strategy["fm_version"] = strategy_fm_version
    
    # Calculate coverage based on active failure modes
    total_fms = len(fm_strategies)
    active_fms = sum(1 for fm in fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0
    
    # Count failure modes with new versions available
    fms_with_updates = sum(1 for fm in fm_strategies if fm.get("has_new_version", False))
    strategy["failure_modes_with_updates"] = fms_with_updates
    
    # Update strategy stats
    strategy["active_failure_modes"] = active_fms
    strategy["coverage_score"] = round(coverage_score, 1)
    
    # Count affected equipment from hierarchy
    affected_equipment_count = await db.equipment_nodes.count_documents(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id})
    )
    strategy["affected_equipment_count"] = affected_equipment_count
    
    # Count equipment that actually have strategy applied (have maintenance program with strategy tasks)
    programs_with_strategy = await db.maintenance_programs_v2.find(
        maintenance_scoped(current_user, {
            "equipment_type_id": equipment_type_id,
            "strategy_tasks": {"$gt": 0}
        }),
        {"equipment_id": 1}
    ).to_list(1000)
    equipment_with_strategy_applied = len(set([p.get("equipment_id") for p in programs_with_strategy if p.get("equipment_id")]))
    strategy["equipment_with_strategy_applied_count"] = equipment_with_strategy_applied
    strategy["strategy_needs_apply"] = await enrich_strategy_needs_apply(
        equipment_type_id, strategy, user=current_user
    )
    
    # Persist only safe backfills — never rewrite the full FM list from a stale GET snapshot
    # (that could undo a concurrent library sync bumping fm_version).
    if needs_effects_backfill:
        fresh = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
            {"failure_mode_strategies": 1},
        )
        if fresh:
            fresh_fms = [
                strip_fm_enrichment_fields(fm)
                for fm in fresh.get("failure_mode_strategies", [])
            ]
            for patch in effects_backfill:
                patch_id = patch.get("failure_mode_id")
                for i, fm in enumerate(fresh_fms):
                    if fm.get("failure_mode_id") == patch_id:
                        fresh_fms[i]["potential_effects"] = patch["potential_effects"]
                        break
            await db.equipment_type_strategies.update_one(
                {"equipment_type_id": equipment_type_id},
                {"$set": {"failure_mode_strategies": fresh_fms}},
            )

    if strategy.get("active_failure_modes") != active_fms:
        await db.equipment_type_strategies.update_one(
            {"equipment_type_id": equipment_type_id},
            {"$set": {
                "active_failure_modes": active_fms,
                "coverage_score": round(coverage_score, 1),
            }},
        )
    
    return {
        "strategy": strategy,
        "equipment_type_id": equipment_type_id,
        "exists": True,
        "affected_equipment_count": affected_equipment_count,
        "strategy_needs_apply": strategy.get("strategy_needs_apply", False),
    }


async def create_equipment_type_strategy(
    request: CreateEquipmentTypeStrategyRequest, current_user: dict,
):
    """Create a new equipment type strategy"""
    # Check if strategy already exists
    existing = await db.equipment_type_strategies.find_one({
        "equipment_type_id": request.equipment_type_id
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Strategy already exists for {request.equipment_type_name}"
        )
    
    # Get failure modes for this equipment type
    failure_modes = await get_failure_modes_for_equipment_type(
        request.equipment_type_id,
        request.equipment_type_name
    )
    
    # Build failure mode strategies and task templates
    fm_strategies = []
    all_tasks = []
    
    for fm in failure_modes:
        fm_id = fm.get("id", str(uuid.uuid4()))
        fm_name = fm.get("failure_mode", fm.get("name", "Unknown"))
        
        # Determine strategy type and detection methods
        detection_methods = map_detection_methods(fm)
        strategy_type = determine_strategy_type(fm)
        
        # Generate tasks for this failure mode
        tasks = generate_default_tasks_for_failure_mode(fm, strategy_type, detection_methods)
        for task in tasks:
            task.is_mandatory = False
        all_tasks.extend(tasks)
        
        # Create failure mode strategy with RPN data
        severity = fm.get("severity", 5)
        occurrence = fm.get("occurrence", 5)
        detectability = fm.get("detectability", 5)
        rpn = fm.get("rpn", severity * occurrence * detectability)
        
        # Determine risk level from RPN
        if rpn >= 250:
            risk_level = "critical"
        elif rpn >= 180:
            risk_level = "high"
        elif rpn >= 100:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Get potential effects from the failure mode
        potential_effects = fm.get("potential_effects", [])
        if isinstance(potential_effects, str):
            potential_effects = [potential_effects] if potential_effects else []
        
        # Get version info for tracking updates
        fm_version = coerce_fm_library_version(fm.get("version", 1))
        fm_updated_at = fm.get("updated_at")
        if fm_updated_at:
            fm_updated_at = str(fm_updated_at)
        
        fm_strategy = FailureModeStrategy(
            failure_mode_id=fm_id,
            failure_mode_name=fm_name,
            potential_effects=potential_effects,
            fm_version=fm_version,
            fm_updated_at=fm_updated_at,
            strategy_type=strategy_type,
            detection_methods=[DetectionMethod(m) for m in detection_methods if m in [e.value for e in DetectionMethod]],
            task_ids=[t.id for t in tasks],
            severity=severity,
            occurrence=occurrence,
            detectability=detectability,
            rpn=rpn,
            risk_if_unaddressed=risk_level,
            enabled=False,
        )
        fm_strategies.append(fm_strategy)
    
    # Create the strategy
    strategy = EquipmentTypeStrategy(
        id=str(uuid.uuid4()),
        equipment_type_id=request.equipment_type_id,
        equipment_type_name=request.equipment_type_name,
        description=request.description or f"Maintenance strategy for {request.equipment_type_name}",
        failure_mode_strategies=fm_strategies,
        task_templates=all_tasks,
        total_failure_modes=len(fm_strategies),
        total_tasks=len(all_tasks),
        coverage_score=0.0,
        active_failure_modes=0,
        created_by=current_user.get("user_id"),
        auto_generated=request.auto_generate,
        status="disabled",
    )
    
    strategy_dict = strategy.model_dump()
    await db.equipment_type_strategies.insert_one(strategy_dict)
    
    # Log audit
    await log_strategy_audit(
        action="create_strategy",
        equipment_type_id=request.equipment_type_id,
        user_id=current_user.get("user_id"),
        details={
            "equipment_type_name": request.equipment_type_name,
            "total_failure_modes": len(fm_strategies),
            "total_tasks": len(all_tasks),
            "auto_generated": request.auto_generate
        }
    )
    
    # Remove MongoDB _id
    strategy_dict.pop("_id", None)
    
    return strategy_dict


async def update_equipment_type_strategy(
    equipment_type_id: str,
    request: UpdateEquipmentTypeStrategyRequest, current_user: dict
):
    """Update an equipment type strategy"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    update_data = {"updated_at": datetime.utcnow().isoformat()}
    disabling = request.status == "disabled"
    status_only = is_status_only_strategy_update(request)
    
    if request.description is not None:
        update_data["description"] = request.description
    
    if request.failure_mode_strategies is not None:
        update_data["failure_mode_strategies"] = [
            fm.model_dump() if hasattr(fm, 'model_dump') else fm 
            for fm in request.failure_mode_strategies
        ]
        update_data["total_failure_modes"] = len(request.failure_mode_strategies)
    
    if request.task_templates is not None:
        update_data["task_templates"] = [
            t.model_dump() if hasattr(t, 'model_dump') else t 
            for t in request.task_templates
        ]
        update_data["total_tasks"] = len(request.task_templates)
    
    if request.default_frequency_matrix is not None:
        update_data["default_frequency_matrix"] = request.default_frequency_matrix.model_dump()
    
    if request.status is not None:
        update_data["status"] = request.status
        from services.maintenance_scheduler_sync import invalidate_active_strategy_type_cache
        invalidate_active_strategy_type_cache()
    
    # Increment version
    current_version = strategy.get("version", "1.0")
    try:
        major, minor = map(int, current_version.split("."))
        update_data["version"] = f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        update_data["version"] = "1.1"
    
    # Add to version history
    version_entry = {
        "version": update_data["version"],
        "updated_at": update_data["updated_at"],
        "updated_by": current_user.get("user_id"),
        "changes": list(update_data.keys())
    }
    if not (disabling and status_only):
        update_data["strategy_needs_apply"] = True
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": update_data,
            "$push": {"version_history": version_entry}
        }
    )
    
    propagation: Dict[str, Any] = {}
    if disabling:
        propagation.update(
            await _apply_strategy_disable_to_programs_and_schedules(equipment_type_id)
        )
        if status_only:
            await clear_strategy_needs_apply(
                equipment_type_id,
                applied_version=update_data["version"],
            )
    
    updated = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    if updated is not None and isinstance(updated, dict):
        if disabling and status_only:
            updated["strategy_needs_apply"] = False
        elif not disabling:
            updated["strategy_needs_apply"] = True
        updated.update(propagation)

    return updated


async def get_strategy_disable_impact(
    equipment_type_id: str,
    current_user: dict,
):
    """Preview impact of disabling a maintenance strategy."""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    if not strategy:
        return {
            "equipment_type_id": equipment_type_id,
            "active_program_count": 0,
            "open_scheduled_tasks_count": 0,
            "has_impact": False,
        }

    active_program_count = await count_active_programs_for_strategy(equipment_type_id)
    open_scheduled_tasks_count = await count_open_scheduled_tasks_for_strategy(
        equipment_type_id
    )
    return {
        "equipment_type_id": equipment_type_id,
        "active_program_count": active_program_count,
        "open_scheduled_tasks_count": open_scheduled_tasks_count,
        "has_impact": active_program_count > 0 or open_scheduled_tasks_count > 0,
    }


async def delete_equipment_type_strategy(
    equipment_type_id: str, current_user: dict
):
    """
    Delete an equipment type strategy AND fully clean up:
      - Hard-delete all scheduled_tasks for this equipment type
      - Hard-delete all maintenance_programs linked to the strategy
      - Delete Equipment Manager (v2) programs for affected equipment
      - Completed history is preserved separately in `maintenance_history`
    """
    schedule_refresh = await clear_equipment_type_schedule_after_strategy_delete(
        equipment_type_id,
    )

    result = await db.equipment_type_strategies.delete_one({
        "equipment_type_id": equipment_type_id
    })

    if result.deleted_count == 0 and schedule_refresh.get("programs_deleted", 0) == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")

    await log_strategy_audit(
        action="delete_strategy",
        equipment_type_id=equipment_type_id,
        user_id=current_user.get("user_id")
    )

    return {
        "message": "Strategy deleted",
        "equipment_type_id": equipment_type_id,
        "programs_deleted": schedule_refresh.get("programs_deleted", 0),
        "scheduled_tasks_deleted": schedule_refresh.get("scheduled_tasks_deleted", 0),
        "v2_programs_deleted": schedule_refresh.get("v2_programs_deleted", 0),
        "schedule_refresh": schedule_refresh,
    }



async def sync_failure_mode_from_library(
    equipment_type_id: str,
    failure_mode_id: str,
    current_user: dict,
):
    """Refresh one failure mode strategy row from the library when a newer version exists."""
    existing_strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    if not existing_strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    fm_strategies = existing_strategy.get("failure_mode_strategies", [])
    existing_fm = None
    for fm in fm_strategies:
        if fm_strategy_row_matches_id(fm, failure_mode_id):
            existing_fm = fm
            break
    if not existing_fm:
        raise HTTPException(status_code=404, detail="Failure mode strategy not found")

    library_fm = await lookup_library_failure_mode(
        existing_fm.get("failure_mode_id"),
        existing_fm.get("failure_mode_name"),
    )
    if not library_fm:
        raise HTTPException(status_code=404, detail="Failure mode not found in library")

    library_version = coerce_fm_library_version(library_fm.get("version") or 1)
    strategy_version = coerce_fm_library_version(existing_fm.get("fm_version", 1))
    if strategy_version >= library_version:
        return {
            "message": "Failure mode already up to date",
            "failure_mode_id": failure_mode_id,
            "fm_version": strategy_version,
            "updated": False,
            "failure_mode_strategy": existing_fm,
        }

    existing_tasks = list(existing_strategy.get("task_templates", []))
    _, existing_tasks, tasks_refreshed = refresh_failure_mode_strategy_from_library(
        library_fm, existing_fm, existing_tasks
    )

    fm_name = library_fm.get("failure_mode") or existing_fm.get("failure_mode_name") or failure_mode_id
    new_version = await _bump_strategy_version(
        existing_strategy,
        [{
            "type": "failure_mode_sync",
            "summary": (
                f"Synced failure mode '{fm_name}' from library "
                f"(v{strategy_version} → v{library_version}, {tasks_refreshed} tasks refreshed)"
            ),
        }],
        current_user.get("user_id"),
    )

    persisted_fms = [strip_fm_enrichment_fields(fm) for fm in fm_strategies]
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "failure_mode_strategies": persisted_fms,
                "task_templates": existing_tasks,
                "total_tasks": len(existing_tasks),
                "updated_at": datetime.utcnow().isoformat(),
            },
        },
    )

    schedule_refresh = await _refresh_applied_equipment_timeline(
        equipment_type_id,
        user_id=current_user.get("user_id"),
    )

    return {
        "message": f"Synced failure mode from library (v{strategy_version} → v{library_version})",
        "failure_mode_id": failure_mode_id,
        "fm_version": library_version,
        "new_version": new_version,
        "updated": True,
        "tasks_refreshed": tasks_refreshed,
        "failure_mode_strategy": existing_fm,
        "strategy_needs_apply": True,
        "schedule_refresh": schedule_refresh,
    }


async def get_affected_equipment(
    equipment_type_id: str, current_user: dict
):
    """Get list of equipment affected by this strategy.

    Each item carries `strategy_applied: bool` indicating whether this equipment
    already has an active maintenance program with strategy tasks — used by the
    Apply Strategy dialog to pre-select only the equipment that is currently
    "active" (already covered).
    """
    equipment_nodes = await db.equipment_nodes.find(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "level": 1, "location": 1, "parent_id": 1, "criticality": 1}
    ).to_list(500)

    applied_equipment_ids = set(
        await db.maintenance_programs_v2.distinct(
            "equipment_id",
            {"equipment_type_id": equipment_type_id, "strategy_tasks": {"$gt": 0}},
        )
    )

    for eq in equipment_nodes:
        eq["strategy_applied"] = eq.get("id") in applied_equipment_ids

    return {
        "equipment": equipment_nodes,
        "total": len(equipment_nodes),
        "applied_count": len(applied_equipment_ids),
        "equipment_type_id": equipment_type_id
    }


async def get_strategy_version_history(
    equipment_type_id: str, current_user: dict
):
    """Get version history for an equipment type strategy"""
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0, "version_history": 1, "version": 1}
    )
    
    if not strategy:
        # Align with GET /{equipment_type_id} — no strategy yet is not an error for the UI
        return {
            "current_version": "1.0",
            "version_history": [],
            "exists": False,
        }
    
    return {
        "current_version": strategy.get("version", "1.0"),
        "version_history": strategy.get("version_history", []),
        "exists": True,
    }


async def get_strategy_audit_log(
    equipment_type_id: str,
    limit: int = 50, *, current_user: dict
):
    """Get audit log for an equipment type strategy"""
    audit_entries = await db.maintenance_strategy_audit.find(
        maintenance_scoped(current_user, {"entity_id": equipment_type_id}),
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "audit_log": audit_entries,
        "total": len(audit_entries)
    }


