"""Sync equipment-type strategy with failure-mode library."""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from models.maintenance_strategy_v2 import DetectionMethod, FailureModeStrategy
from services.maintenance_scheduler_sync import propagate_strategy_schedule_updates
from services.maintenance_strategy_helpers import (
    coerce_fm_library_version,
    determine_strategy_type,
    generate_default_tasks_for_failure_mode,
    get_failure_modes_for_equipment_type,
    library_fm_matches_strategy_row,
    log_strategy_audit,
    lookup_library_failure_mode,
    map_detection_methods,
    normalize_fm_id,
    refresh_failure_mode_strategy_from_library,
    strip_fm_enrichment_fields,
)

logger = logging.getLogger(__name__)


async def refresh_applied_equipment_timeline(
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


async def sync_equipment_type_strategy(equipment_type_id: str, current_user: dict):
    """
    Sync strategy with library - adds new failure modes and tasks without overwriting existing ones.
  """
    existing_strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })

    if not existing_strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    equipment_type_name = existing_strategy.get("equipment_type_name", "")

    library_failure_modes = await get_failure_modes_for_equipment_type(
        equipment_type_id,
        equipment_type_name,
    )

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

        if fm_id in existing_fm_ids or fm_name_key in existing_fm_names:
            for existing_fm in existing_fm_strategies:
                if library_fm_matches_strategy_row(fm, existing_fm):
                    if coerce_fm_library_version(existing_fm.get("fm_version", 1)) < fm_version:
                        await _apply_library_fm_refresh(existing_fm, fm)
                    break
            continue

        detection_methods = map_detection_methods(fm)
        strategy_type = determine_strategy_type(fm)
        tasks = generate_default_tasks_for_failure_mode(fm, strategy_type, detection_methods)
        new_tasks.extend(tasks)

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
            detection_methods=[
                DetectionMethod(m)
                for m in detection_methods
                if m in [e.value for e in DetectionMethod]
            ],
            task_ids=[t.id for t in tasks],
            severity=severity,
            occurrence=occurrence,
            detectability=detectability,
            rpn=rpn,
            risk_if_unaddressed=risk_level,
            enabled=True,
        )
        new_fm_strategies.append(fm_strategy)

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

    all_fm_strategies = existing_fm_strategies + [fm.model_dump() for fm in new_fm_strategies]
    all_tasks = existing_tasks + [t.model_dump() for t in new_tasks]
    persisted_fms = [strip_fm_enrichment_fields(fm) for fm in all_fm_strategies]

    total_fms = len(all_fm_strategies)
    active_fms = sum(1 for fm in all_fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0

    current_version = existing_strategy.get("version", "1.0")
    try:
        major, minor = map(int, current_version.split("."))
        new_version = f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        new_version = "1.1"

    version_entry = {
        "version": new_version,
        "changed_at": datetime.utcnow().isoformat(),
        "changed_by": current_user.get("user_id"),
        "change_type": "sync",
        "change_summary": (
            f"Synced with library: Added {len(new_fm_strategies)} new failure modes, "
            f"{len(new_tasks)} new tasks. Updated {len(updated_fms)} existing FMs "
            f"({tasks_refreshed} task templates refreshed)."
        ),
    }

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
                "updated_at": datetime.utcnow().isoformat(),
            },
            "$push": {"version_history": version_entry},
        },
    )

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

    schedule_refresh = await refresh_applied_equipment_timeline(
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
