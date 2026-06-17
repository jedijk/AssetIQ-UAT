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

from services.maintenance_scheduler_sync import (
    clear_equipment_type_schedule_after_strategy_delete,
    propagate_strategy_schedule_updates,
)
from services.maintenance_strategy_propagation import (
    _describe_fm_change,
    _bump_strategy_version,
    _toggle_programs_for_failure_mode,
    _cancel_open_scheduled_tasks_for_failure_mode,
    is_enable_only_fm_toggle,
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

logger = logging.getLogger(__name__)


async def _refresh_applied_equipment_timeline(
    equipment_type_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Regenerate programs + scheduled_tasks for equipment already covered by strategy."""
    try:
        return await propagate_strategy_schedule_updates(
            equipment_type_id,
            user_id=user_id,
        )
    except Exception as exc:
        logger.exception(
            "Schedule timeline refresh failed for equipment type %s: %s",
            equipment_type_id,
            exc,
        )
        return {}



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
    
    strategies = await db.equipment_type_strategies.find(query, {"_id": 0}).to_list(500)
    
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
        {"equipment_type_id": equipment_type_id},
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
    affected_equipment_count = await db.equipment_nodes.count_documents({
        "equipment_type_id": equipment_type_id
    })
    strategy["affected_equipment_count"] = affected_equipment_count
    
    # Count equipment that actually have strategy applied (have maintenance program with strategy tasks)
    programs_with_strategy = await db.maintenance_programs_v2.find(
        {
            "equipment_type_id": equipment_type_id,
            "strategy_tasks": {"$gt": 0}
        },
        {"equipment_id": 1}
    ).to_list(1000)
    equipment_with_strategy_applied = len(set([p.get("equipment_id") for p in programs_with_strategy if p.get("equipment_id")]))
    strategy["equipment_with_strategy_applied_count"] = equipment_with_strategy_applied
    strategy["strategy_needs_apply"] = await enrich_strategy_needs_apply(
        equipment_type_id, strategy
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
            enabled=True
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
        coverage_score=100.0 if fm_strategies else 0.0,  # All FMs are enabled by default
        active_failure_modes=len(fm_strategies),  # Track active count
        created_by=current_user.get("user_id"),
        auto_generated=request.auto_generate,
        status="active"
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
    update_data["strategy_needs_apply"] = True
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": update_data,
            "$push": {"version_history": version_entry}
        }
    )
    
    updated = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    if updated is not None and isinstance(updated, dict):
        updated["strategy_needs_apply"] = True

    return updated


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


async def sync_equipment_type_strategy(
    equipment_type_id: str, current_user: dict
):
    """
    Sync strategy with library - adds new failure modes and tasks without overwriting existing ones.
    - Keeps all existing failure mode configurations
    - Keeps all existing task templates
    - Only adds NEW failure modes from the library
    - Only adds NEW tasks for the new failure modes
    - When a library failure mode has a newer version, refreshes FM metadata and
      linked task template content (name, description, type, discipline, frequencies)
    """
    # Get existing strategy
    existing_strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not existing_strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    equipment_type_name = existing_strategy.get("equipment_type_name", "")
    
    # Get all failure modes for this equipment type from library
    library_failure_modes = await get_failure_modes_for_equipment_type(
        equipment_type_id,
        equipment_type_name
    )
    
    # Get existing FM IDs and names for comparison
    existing_fm_strategies = existing_strategy.get("failure_mode_strategies", [])
    existing_fm_ids = {
        normalize_fm_id(fm.get("failure_mode_id"))
        for fm in existing_fm_strategies
        if fm.get("failure_mode_id") is not None
    }
    existing_fm_names = {
        (fm.get("failure_mode_name") or "").strip().lower()
        for fm in existing_fm_strategies
        if fm.get("failure_mode_name")
    }
    existing_tasks = existing_strategy.get("task_templates", [])
    
    # Track what was added
    new_fm_strategies = []
    new_tasks = []
    updated_fms = []
    tasks_refreshed = 0
    refreshed_task_templates: List[Dict[str, Any]] = []
    refreshed_fm_keys: set = set()

    async def _apply_library_fm_refresh(existing_fm: Dict[str, Any], library_fm: Dict[str, Any]) -> None:
        nonlocal tasks_refreshed, existing_tasks, refreshed_task_templates
        _, existing_tasks, n = refresh_failure_mode_strategy_from_library(
            library_fm, existing_fm, existing_tasks
        )
        tasks_refreshed += n
        updated_fms.append(library_fm.get("failure_mode") or existing_fm.get("failure_mode_name") or "")
        key = str(existing_fm.get("failure_mode_id") or existing_fm.get("failure_mode_name") or "")
        refreshed_fm_keys.add(key)
        for tid in existing_fm.get("task_ids") or []:
            task = next(
                (t for t in existing_tasks if str(t.get("id")) == str(tid)),
                None,
            )
            if task:
                refreshed_task_templates.append(task)
    
    for fm in library_failure_modes:
        fm_id = normalize_fm_id(fm.get("id", str(uuid.uuid4())))
        fm_name = fm.get("failure_mode", fm.get("name", "Unknown"))
        fm_version = coerce_fm_library_version(fm.get("version", 1))
        fm_updated_at = fm.get("updated_at")
        if fm_updated_at:
            fm_updated_at = str(fm_updated_at)
        fm_name_key = fm_name.strip().lower()
        
        # Check if this FM already exists in strategy
        if fm_id in existing_fm_ids or fm_name_key in existing_fm_names:
            for existing_fm in existing_fm_strategies:
                if library_fm_matches_strategy_row(fm, existing_fm):
                    if coerce_fm_library_version(existing_fm.get("fm_version", 1)) < fm_version:
                        await _apply_library_fm_refresh(existing_fm, fm)
                    break
            continue
        
        # This is a NEW failure mode - add it
        detection_methods = map_detection_methods(fm)
        strategy_type = determine_strategy_type(fm)
        
        # Generate tasks for this new failure mode
        tasks = generate_default_tasks_for_failure_mode(fm, strategy_type, detection_methods)
        new_tasks.extend(tasks)
        
        # Create failure mode strategy
        severity = fm.get("severity", 5)
        occurrence = fm.get("occurrence", 5)
        detectability = fm.get("detectability", 5)
        rpn = fm.get("rpn", severity * occurrence * detectability)
        
        if rpn >= 250:
            risk_level = "critical"
        elif rpn >= 180:
            risk_level = "high"
        elif rpn >= 100:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        potential_effects = fm.get("potential_effects", [])
        if isinstance(potential_effects, str):
            potential_effects = [potential_effects] if potential_effects else []
        
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
            enabled=True
        )
        new_fm_strategies.append(fm_strategy)

    # Refresh strategy FMs that have newer library versions but were not in the ET query
    for existing_fm in existing_fm_strategies:
        key = str(existing_fm.get("failure_mode_id") or existing_fm.get("failure_mode_name") or "")
        if key in refreshed_fm_keys:
            continue
        library_fm = await lookup_library_failure_mode(
            existing_fm.get("failure_mode_id"),
            existing_fm.get("failure_mode_name"),
        )
        if not library_fm:
            continue
        library_version = coerce_fm_library_version(library_fm.get("version") or 1)
        if coerce_fm_library_version(existing_fm.get("fm_version", 1)) < library_version:
            await _apply_library_fm_refresh(existing_fm, library_fm)
    
    # Merge: existing + new
    all_fm_strategies = existing_fm_strategies + [fm.model_dump() for fm in new_fm_strategies]
    all_tasks = existing_tasks + [t.model_dump() for t in new_tasks]
    persisted_fms = [strip_fm_enrichment_fields(fm) for fm in all_fm_strategies]
    
    # Update totals
    total_fms = len(all_fm_strategies)
    active_fms = sum(1 for fm in all_fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0
    
    # Increment version
    current_version = existing_strategy.get("version", "1.0")
    try:
        major, minor = map(int, current_version.split("."))
        new_version = f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        new_version = "1.1"
    
    # Create version history entry
    version_entry = {
        "version": new_version,
        "changed_at": datetime.utcnow().isoformat(),
        "changed_by": current_user.get("user_id"),
        "change_type": "sync",
        "change_summary": (
            f"Synced with library: Added {len(new_fm_strategies)} new failure modes, "
            f"{len(new_tasks)} new tasks. Updated {len(updated_fms)} existing FMs "
            f"({tasks_refreshed} task templates refreshed)."
        )
    }
    
    # Update the strategy
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "failure_mode_strategies": persisted_fms,
                "task_templates": all_tasks,
                "total_failure_modes": total_fms,
                "total_tasks": len(all_tasks),
                "active_failure_modes": active_fms,
                "coverage_score": round(coverage_score, 1),
                "version": new_version,
                "updated_at": datetime.utcnow().isoformat()
            },
            "$push": {"version_history": version_entry}
        }
    )
    
    # Log audit
    await log_strategy_audit(
        action="sync_strategy",
        equipment_type_id=equipment_type_id,
        user_id=current_user.get("user_id"),
        details={
            "new_failure_modes": len(new_fm_strategies),
            "new_tasks": len(new_tasks),
            "updated_fms": len(updated_fms),
            "tasks_refreshed": tasks_refreshed,
            "new_version": new_version,
        },
    )

    schedule_refresh = await _refresh_applied_equipment_timeline(
        equipment_type_id,
        user_id=current_user.get("user_id"),
    )

    return {
        "message": "Strategy synced with library",
        "equipment_type_id": equipment_type_id,
        "new_failure_modes_added": len(new_fm_strategies),
        "new_tasks_added": len(new_tasks),
        "updated_failure_modes": len(updated_fms),
        "tasks_refreshed": tasks_refreshed,
        "total_failure_modes": total_fms,
        "total_tasks": len(all_tasks),
        "new_version": new_version,
        "strategy_needs_apply": True,
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
        {"equipment_type_id": equipment_type_id},
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
        {"entity_id": equipment_type_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "audit_log": audit_entries,
        "total": len(audit_entries)
    }


# ============= Failure Mode Strategy Endpoints =============

async def get_failure_mode_strategies(
    equipment_type_id: str, current_user: dict
):
    """Get all failure mode strategies for an equipment type"""
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
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


# ============= Task Generation Endpoints =============

async def generate_tasks_for_equipment(
    equipment_type_id: str,
    request: GenerateTasksRequest, current_user: dict
):
    """Generate maintenance tasks for a specific equipment asset based on its criticality"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found for this equipment type")
    
    # Generate tasks based on criticality
    generated_tasks = []
    disabled_fm_set = set(request.disabled_failure_modes)
    
    for task_template in strategy.get("task_templates", []):
        # Check if any of the task's failure modes are disabled
        task_fm_ids = set(task_template.get("failure_mode_ids", []))
        if task_fm_ids and task_fm_ids.issubset(disabled_fm_set):
            continue  # Skip task if all its failure modes are disabled
        
        # Get frequency based on criticality
        freq_matrix = task_template.get("frequency_matrix", {})
        frequency = calculate_frequency_for_criticality(
            CriticalityFrequency(**freq_matrix),
            request.criticality
        )
        
        # Create generated task
        gen_task = GeneratedTask(
            id=f"gen_{uuid.uuid4()}",
            equipment_id=request.equipment_id,
            equipment_name=request.equipment_name,
            equipment_type_id=equipment_type_id,
            strategy_id=strategy.get("id"),
            strategy_version=strategy.get("version", "1.0"),
            task_template_id=task_template.get("id"),
            failure_mode_ids=task_template.get("failure_mode_ids", []),
            name=task_template.get("name"),
            description=task_template.get("description"),
            task_type=MaintenanceStrategyType(task_template.get("task_type", "preventive")),
            frequency=frequency,
            asset_criticality=request.criticality,
            activation_state=TaskActivationState.INHERITED,
            duration_hours=task_template.get("duration_hours", 1.0),
            skills_required=task_template.get("skills_required", []),
            discipline=task_template.get("discipline"),
            sync_status="current"
        )
        generated_tasks.append(gen_task)
    
    # Create or update equipment strategy instance
    existing_instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": request.equipment_id
    })
    
    instance = EquipmentStrategyInstance(
        id=existing_instance.get("id") if existing_instance else str(uuid.uuid4()),
        equipment_id=request.equipment_id,
        equipment_name=request.equipment_name,
        equipment_type_id=equipment_type_id,
        criticality=request.criticality,
        operating_context=request.operating_context,
        strategy_id=strategy.get("id"),
        strategy_version=strategy.get("version", "1.0"),
        generated_tasks=generated_tasks,
        disabled_failure_modes=request.disabled_failure_modes,
        sync_status="current",
        last_synced_at=datetime.utcnow().isoformat()
    )
    
    instance_dict = instance.model_dump()
    
    if existing_instance:
        await db.equipment_strategy_instances.update_one(
            {"equipment_id": request.equipment_id},
            {"$set": instance_dict}
        )
    else:
        await db.equipment_strategy_instances.insert_one(instance_dict)
    
    instance_dict.pop("_id", None)
    
    return {
        "equipment_id": request.equipment_id,
        "criticality": request.criticality.value,
        "generated_tasks": [t.model_dump() for t in generated_tasks],
        "total_tasks": len(generated_tasks),
        "strategy_version": strategy.get("version", "1.0")
    }


# ============= Equipment Strategy Instance Endpoints =============

async def get_equipment_strategy_instance(
    equipment_id: str, current_user: dict
):
    """Get the strategy instance for a specific equipment asset"""
    instance = await db.equipment_strategy_instances.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0}
    )
    
    if not instance:
        return {"instance": None, "exists": False}
    
    return {"instance": instance, "exists": True}


async def override_equipment_task(
    equipment_id: str,
    task_id: str,
    updates: Dict[str, Any], current_user: dict
):
    """Override a generated task at equipment level"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    generated_tasks = instance.get("generated_tasks", [])
    updated = False
    
    for i, task in enumerate(generated_tasks):
        if task.get("id") == task_id:
            # Store original values before override
            if not task.get("is_overridden"):
                generated_tasks[i]["original_frequency"] = task.get("frequency")
            
            # Apply updates
            for key, value in updates.items():
                if key in ["frequency", "activation_state", "override_reason"]:
                    generated_tasks[i][key] = value
            
            generated_tasks[i]["is_overridden"] = True
            generated_tasks[i]["activation_state"] = TaskActivationState.OVERRIDDEN.value
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "generated_tasks": generated_tasks,
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Task overridden", "task_id": task_id}


async def disable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str,
    reason: Optional[str] = None, *, current_user: dict
):
    """Disable a specific failure mode for an equipment asset"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Add to disabled list
    disabled_fms = instance.get("disabled_failure_modes", [])
    disabled_reasons = instance.get("disabled_fm_reasons", {})
    
    if failure_mode_id not in disabled_fms:
        disabled_fms.append(failure_mode_id)
    
    if reason:
        disabled_reasons[failure_mode_id] = reason
    
    # Disable related tasks
    generated_tasks = instance.get("generated_tasks", [])
    for i, task in enumerate(generated_tasks):
        if failure_mode_id in task.get("failure_mode_ids", []):
            generated_tasks[i]["activation_state"] = TaskActivationState.DISABLED.value
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "disabled_failure_modes": disabled_fms,
                "disabled_fm_reasons": disabled_reasons,
                "generated_tasks": generated_tasks,
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Failure mode disabled", "failure_mode_id": failure_mode_id}


async def regenerate_equipment_tasks(
    equipment_id: str,
    request: RegenerateStrategyRequest, current_user: dict
):
    """Regenerate tasks for equipment after strategy template changes"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Get latest strategy
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": instance.get("equipment_type_id")
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Equipment type strategy not found")
    
    # Preview mode - just show what would change
    if request.preview_only:
        # TODO: Implement detailed preview
        return {
            "preview": True,
            "current_version": instance.get("strategy_version"),
            "new_version": strategy.get("version"),
            "changes": {
                "tasks_to_add": [],
                "tasks_to_remove": [],
                "tasks_to_update": []
            }
        }
    
    # Regenerate tasks
    criticality = CriticalityLevel(instance.get("criticality", "low"))
    disabled_fms = instance.get("disabled_failure_modes", [])
    
    # Preserve overrides if requested
    preserved_overrides = {}
    if request.preserve_overrides:
        for task in instance.get("generated_tasks", []):
            if task.get("is_overridden"):
                preserved_overrides[task.get("task_template_id")] = {
                    "frequency": task.get("frequency"),
                    "override_reason": task.get("override_reason")
                }
    
    # Generate new tasks
    generated_tasks = []
    for task_template in strategy.get("task_templates", []):
        task_fm_ids = set(task_template.get("failure_mode_ids", []))
        if task_fm_ids and task_fm_ids.issubset(set(disabled_fms)):
            continue
        
        freq_matrix = task_template.get("frequency_matrix", {})
        frequency = calculate_frequency_for_criticality(
            CriticalityFrequency(**freq_matrix),
            criticality
        )
        
        # Check for preserved override
        template_id = task_template.get("id")
        is_overridden = template_id in preserved_overrides
        
        if is_overridden:
            frequency = TaskFrequency(preserved_overrides[template_id]["frequency"])
        
        gen_task = GeneratedTask(
            id=f"gen_{uuid.uuid4()}",
            equipment_id=equipment_id,
            equipment_name=instance.get("equipment_name"),
            equipment_type_id=instance.get("equipment_type_id"),
            strategy_id=strategy.get("id"),
            strategy_version=strategy.get("version", "1.0"),
            task_template_id=template_id,
            failure_mode_ids=task_template.get("failure_mode_ids", []),
            name=task_template.get("name"),
            description=task_template.get("description"),
            task_type=MaintenanceStrategyType(task_template.get("task_type", "preventive")),
            frequency=frequency,
            asset_criticality=criticality,
            activation_state=TaskActivationState.OVERRIDDEN if is_overridden else TaskActivationState.INHERITED,
            is_overridden=is_overridden,
            override_reason=preserved_overrides.get(template_id, {}).get("override_reason") if is_overridden else None,
            original_frequency=None,
            duration_hours=task_template.get("duration_hours", 1.0),
            skills_required=task_template.get("skills_required", []),
            discipline=task_template.get("discipline"),
            sync_status="current"
        )
        generated_tasks.append(gen_task)
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "generated_tasks": [t.model_dump() for t in generated_tasks],
                "strategy_version": strategy.get("version"),
                "sync_status": "current",
                "last_synced_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {
        "message": "Tasks regenerated",
        "equipment_id": equipment_id,
        "total_tasks": len(generated_tasks),
        "new_version": strategy.get("version"),
        "overrides_preserved": len(preserved_overrides)
    }



# ============= Local Tasks Endpoints =============

async def add_local_task(
    equipment_id: str,
    request: AddTaskTemplateRequest, current_user: dict
):
    """Add a local task to an equipment (not from template)"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Create local task
    local_task = MaintenanceTaskTemplate(
        id=f"local_{uuid.uuid4()}",
        name=request.name,
        description=request.description,
        task_type=request.task_type,
        frequency_matrix=request.frequency_matrix or CriticalityFrequency(),
        duration_hours=request.duration_hours,
        skills_required=request.skills_required,
        discipline=request.discipline,
        detection_methods=request.detection_methods,
        failure_mode_ids=request.failure_mode_ids,
        procedure_steps=request.procedure_steps,
        source="local"
    )
    
    local_task_dict = local_task.model_dump()
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$push": {"local_tasks": local_task_dict},
            "$set": {
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    # Log audit
    await log_strategy_audit(
        action="add_local_task",
        equipment_type_id=equipment_id,
        user_id=current_user.get("user_id"),
        details={"task_name": request.name},
        entity_type="equipment_strategy_instance"
    )
    
    return local_task_dict


async def delete_local_task(
    equipment_id: str,
    task_id: str, current_user: dict
):
    """Delete a local task from equipment and clean up its scheduled tasks + maintenance program."""
    result = await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$pull": {"local_tasks": {"id": task_id}},
            "$set": {"updated_at": datetime.utcnow().isoformat()}
        }
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Local task not found")

    # Clean up any maintenance_program + open scheduled_tasks created from this local task
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_id": equipment_id, "task_template_id": task_id},
            {"id": 1, "_id": 0},
        )
    ]
    scheduled_deleted = 0
    if program_ids:
        sched_res = await db.scheduled_tasks.delete_many({
            "maintenance_program_id": {"$in": program_ids},
        })
        scheduled_deleted = sched_res.deleted_count
    progs_res = await db.maintenance_programs.delete_many(
        {"equipment_id": equipment_id, "task_template_id": task_id},
    )

    return {
        "message": "Local task deleted",
        "task_id": task_id,
        "programs_deleted": progs_res.deleted_count,
        "scheduled_tasks_deleted": scheduled_deleted,
    }


async def enable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str, current_user: dict
):
    """Re-enable a previously disabled failure mode for an equipment asset"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Remove from disabled list
    disabled_fms = instance.get("disabled_failure_modes", [])
    disabled_reasons = instance.get("disabled_fm_reasons", {})
    
    if failure_mode_id in disabled_fms:
        disabled_fms.remove(failure_mode_id)
    
    if failure_mode_id in disabled_reasons:
        del disabled_reasons[failure_mode_id]
    
    # Re-enable related tasks
    generated_tasks = instance.get("generated_tasks", [])
    for i, task in enumerate(generated_tasks):
        if failure_mode_id in task.get("failure_mode_ids", []):
            if task.get("activation_state") == TaskActivationState.DISABLED.value:
                generated_tasks[i]["activation_state"] = TaskActivationState.INHERITED.value
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "disabled_failure_modes": disabled_fms,
                "disabled_fm_reasons": disabled_reasons,
                "generated_tasks": generated_tasks,
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Failure mode enabled", "failure_mode_id": failure_mode_id}


# ============= Sync Status Endpoint =============

async def get_equipment_sync_status(
    equipment_id: str, current_user: dict
):
    """Check sync status between equipment strategy and type strategy"""
    instance = await db.equipment_strategy_instances.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0}
    )
    
    if not instance:
        return {"sync_status": "not_initialized", "needs_generation": True}
    
    # Get latest strategy version
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": instance.get("equipment_type_id")},
        {"_id": 0, "version": 1}
    )
    
    if not strategy:
        return {
            "sync_status": "orphaned",
            "message": "Equipment type strategy not found"
        }
    
    current_version = instance.get("strategy_version", "0.0")
    latest_version = strategy.get("version", "1.0")
    
    if current_version == latest_version:
        return {
            "sync_status": instance.get("sync_status", "current"),
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": True
        }
    else:
        return {
            "sync_status": "update_available",
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": False,
            "message": f"Strategy updated from v{current_version} to v{latest_version}"
        }
