"""
Maintenance strategy v2 — program/scheduled-task propagation helpers.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db

logger = logging.getLogger(__name__)

# ============= Strategy → Program Propagation =============

_FREQUENCY_DAYS = {
    "continuous": 1, "daily": 1, "weekly": 7, "bi_weekly": 14,
    "monthly": 30, "quarterly": 90, "semi_annual": 180, "annual": 365,
    "biennial": 730, "on_condition": 30,
}


async def _propagate_task_template_to_programs(equipment_type_id: str, task_template: dict, new_strategy_version: str):
    """
    When a task template is added/edited on a strategy, propagate the changed
    fields to all maintenance_programs that reference it. Frequency is
    re-derived per-program based on each equipment's criticality.
    """
    task_template_id = task_template.get("id")
    if not task_template_id:
        return 0

    freq_matrix = task_template.get("frequency_matrix", {}) or {}
    now = datetime.now(timezone.utc).isoformat()

    # Find all programs that reference this task template
    programs = await db.maintenance_programs.find(
        {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id}
    ).to_list(5000)

    updated = 0
    for prog in programs:
        criticality = prog.get("criticality") or "low"
        frequency = freq_matrix.get(criticality, prog.get("frequency", "monthly"))
        freq_days = _FREQUENCY_DAYS.get(frequency, 30)

        set_fields = {
            "task_name": task_template.get("name", prog.get("task_name")),
            "task_description": task_template.get("description"),
            "task_type": task_template.get("task_type", prog.get("task_type")),
            "estimated_duration_hours": task_template.get("duration_hours", prog.get("estimated_duration_hours", 1.0)),
            "frequency": frequency,
            "frequency_days": freq_days,
            "discipline": task_template.get("discipline"),
            "skills_required": task_template.get("skills_required", []),
            "strategy_version": new_strategy_version,
            "updated_at": now,
        }
        result = await db.maintenance_programs.update_one(
            {"_id": prog["_id"]},
            {"$set": set_fields},
        )
        if result.modified_count > 0:
            updated += 1

    return updated


async def _deactivate_programs_for_task(equipment_type_id: str, task_template_id: str):
    """Mark all programs for this deleted task template as inactive."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.maintenance_programs.update_many(
        {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id},
        {"$set": {"is_active": False, "updated_at": now}},
    )
    return result.modified_count


async def _toggle_programs_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
    enabled: bool,
):
    """
    When a failure mode strategy is enabled/disabled, activate/deactivate
    all programs whose failure_mode_id matches.
    """
    now = datetime.now(timezone.utc).isoformat()
    result = await db.maintenance_programs.update_many(
        {
            "equipment_type_id": equipment_type_id,
            "failure_mode_id": failure_mode_id,
        },
        {"$set": {"is_active": enabled, "updated_at": now}},
    )
    return result.modified_count


# ---------- Scheduled-task cascade (Planner side) ----------

OPEN_TASK_STATUSES_FILTER = {"$nin": ["completed", "cancelled"]}


async def _sync_metadata_to_open_scheduled_tasks(
    equipment_type_id: str,
    task_template: dict,
):
    """
    Push name / description / type / hours changes from a strategy task template
    onto every OPEN scheduled_task that was generated from it.
    Completed/cancelled tasks remain historical.
    """
    task_template_id = task_template.get("id")
    if not task_template_id:
        return 0

    # Find the linked program ids first (scheduled_tasks reference them)
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id},
            {"id": 1, "_id": 0},
        )
    ]
    if not program_ids:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    result = await db.scheduled_tasks.update_many(
        {
            "maintenance_program_id": {"$in": program_ids},
            "status": OPEN_TASK_STATUSES_FILTER,
        },
        {"$set": {
            "task_name": task_template.get("name", ""),
            "task_description": task_template.get("description"),
            "task_type": task_template.get("task_type"),
            "estimated_hours": task_template.get("duration_hours", 1.0),
            "updated_at": now,
        }},
    )
    return result.modified_count


async def _delete_open_scheduled_tasks_for_task(
    equipment_type_id: str,
    task_template_id: str,
):
    """Hard-delete every OPEN scheduled_task generated from a (now removed) strategy task."""
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id},
            {"id": 1, "_id": 0},
        )
    ]
    if not program_ids:
        return 0
    result = await db.scheduled_tasks.delete_many({
        "maintenance_program_id": {"$in": program_ids},
        "status": OPEN_TASK_STATUSES_FILTER,
    })
    return result.deleted_count


async def _cancel_open_scheduled_tasks_for_task(
    equipment_type_id: str,
    task_template_id: str,
):
    """Cancel every OPEN scheduled_task generated from a (now removed) strategy task."""
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id},
            {"id": 1, "_id": 0},
        )
    ]
    if not program_ids:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    result = await db.scheduled_tasks.update_many(
        {
            "maintenance_program_id": {"$in": program_ids},
            "status": OPEN_TASK_STATUSES_FILTER,
        },
        {"$set": {
            "status": "cancelled",
            "notes": "Auto-cancelled: source task removed from strategy",
            "updated_at": now,
        }},
    )
    return result.modified_count


async def _cancel_open_scheduled_tasks_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
):
    """Cancel every OPEN scheduled_task whose program is linked to the disabled FM."""
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id, "failure_mode_id": failure_mode_id},
            {"id": 1, "_id": 0},
        )
    ]
    if not program_ids:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    result = await db.scheduled_tasks.update_many(
        {
            "maintenance_program_id": {"$in": program_ids},
            "status": OPEN_TASK_STATUSES_FILTER,
        },
        {"$set": {
            "status": "cancelled",
            "notes": "Auto-cancelled: failure mode disabled on strategy",
            "updated_at": now,
        }},
    )
    return result.modified_count


async def _delete_open_scheduled_tasks_for_strategy(equipment_type_id: str):
    """Hard-delete every OPEN scheduled_task linked to the given equipment-type strategy."""
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1, "_id": 0},
        )
    ]
    if not program_ids:
        return 0
    result = await db.scheduled_tasks.delete_many({
        "maintenance_program_id": {"$in": program_ids},
        "status": OPEN_TASK_STATUSES_FILTER,
    })
    return result.deleted_count


async def _cancel_open_scheduled_tasks_for_strategy(equipment_type_id: str):
    """Cancel every OPEN scheduled_task linked to the given equipment-type strategy."""
    program_ids = [
        p["id"] async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1, "_id": 0},
        )
    ]
    if not program_ids:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    result = await db.scheduled_tasks.update_many(
        {
            "maintenance_program_id": {"$in": program_ids},
            "status": OPEN_TASK_STATUSES_FILTER,
        },
        {"$set": {
            "status": "cancelled",
            "notes": "Auto-cancelled: maintenance strategy deleted",
            "updated_at": now,
        }},
    )
    return result.modified_count


# ---------- Comprehensive sync: derive active state from strategy truth ----------

async def _resync_programs_with_strategy(equipment_type_id: str):
    """
    Re-derive `is_active` on every maintenance_program for this strategy and
    cancel any open scheduled_tasks for newly inactive programs.

    A program is ACTIVE iff its task template:
      - still exists in the strategy, AND
      - is not toggled off (`is_mandatory != False`), AND
      - either has no FM-strategy linking it OR at least one linking FM is enabled.

    Tasks can be linked from multiple FM-strategies (FM-strategy.task_ids), so
    disabling one FM does NOT deactivate the program if another enabled FM
    still references the same task.
    """
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id}
    )
    if not strategy:
        return {"programs_activated": 0, "programs_deactivated": 0, "scheduled_tasks_cancelled": 0}

    tasks = strategy.get("task_templates", []) or []
    fms = strategy.get("failure_mode_strategies", []) or []
    task_by_id = {t.get("id"): t for t in tasks if t.get("id")}

    task_to_fms: dict = {}
    for fm in fms:
        for tid in (fm.get("task_ids") or []):
            task_to_fms.setdefault(tid, []).append(fm)

    programs = await db.maintenance_programs.find(
        {"equipment_type_id": equipment_type_id}
    ).to_list(5000)

    now = datetime.now(timezone.utc).isoformat()
    activated = 0
    deactivated = 0
    scheduled_cancelled = 0

    for prog in programs:
        tid = prog.get("task_template_id")
        task = task_by_id.get(tid)

        if not task:
            new_active = False
        elif task.get("is_mandatory") is False:
            new_active = False
        elif task.get("task_type") in ("reactive", "corrective"):
            # CM tasks are triggered on failure, not scheduled
            new_active = False
        else:
            linked_fms = task_to_fms.get(tid, [])
            if not linked_fms:
                new_active = True
            else:
                new_active = any(fm.get("enabled") is not False for fm in linked_fms)

        if prog.get("is_active") != new_active:
            await db.maintenance_programs.update_one(
                {"_id": prog["_id"]},
                {"$set": {"is_active": new_active, "updated_at": now}},
            )
            if new_active:
                activated += 1
            else:
                deactivated += 1

            if not new_active:
                r = await db.scheduled_tasks.update_many(
                    {
                        "maintenance_program_id": prog.get("id"),
                        "status": {"$nin": ["completed", "cancelled"]},
                    },
                    {"$set": {
                        "status": "cancelled",
                        "notes": "Auto-cancelled: source task or failure mode disabled",
                        "updated_at": now,
                    }},
                )
                scheduled_cancelled += r.modified_count

    return {
        "programs_activated": activated,
        "programs_deactivated": deactivated,
        "scheduled_tasks_cancelled": scheduled_cancelled,
    }


# ---------- Human-readable version-history descriptors ----------

def _describe_task_change(task: dict, changed_fields: list, action: str = "edit") -> str:
    """Build a human-readable change description for the strategy version history."""
    name = (task or {}).get("name") or "Task"
    if action == "delete":
        return f"Deleted task '{name}'"
    if action == "add":
        return f"Added task '{name}'"
    label_map = {
        "name": "name",
        "description": "description",
        "task_type": "task type",
        "duration_hours": "duration",
        "discipline": "discipline",
        "skills_required": "skills",
        "procedure_steps": "procedure",
        "detection_methods": "detection methods",
        "failure_mode_ids": "linked failure modes",
        "frequency_matrix": "frequency matrix",
        "tools_required": "tools",
        "spare_parts": "spare parts",
        "estimated_cost_eur": "cost",
        "is_mandatory": "active state",
    }
    nice = [label_map.get(k, k) for k in changed_fields]
    if not nice:
        return f"Edited task '{name}'"
    if len(nice) == 1:
        return f"Edited task '{name}' ({nice[0]})"
    return f"Edited task '{name}' ({', '.join(nice)})"


def _describe_fm_change(fm: dict, request) -> str:
    """Build a human-readable change description for a failure-mode mutation."""
    name = (fm or {}).get("failure_mode_name") or "Failure mode"
    parts = []
    if getattr(request, "enabled", None) is True:
        parts.append("enabled")
    elif getattr(request, "enabled", None) is False:
        parts.append("disabled")
    if getattr(request, "strategy_type", None) is not None:
        parts.append(f"strategy → {request.strategy_type}")
    if getattr(request, "frequency_override", None) is not None:
        parts.append(f"frequency override → {request.frequency_override}")
    if getattr(request, "detection_methods", None) is not None:
        parts.append("detection methods updated")
    if getattr(request, "task_ids", None) is not None:
        parts.append("linked tasks updated")
    if not parts:
        return f"Updated failure mode '{name}'"
    return f"Failure mode '{name}' " + ", ".join(parts)



def _bump_version(current_version: str) -> str:
    """Bump a semver-like 'major.minor' string. Defaults to 1.1 if unparseable."""
    try:
        major, minor = map(int, str(current_version).split("."))
        return f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        return "1.1"


async def _sync_maintenance_programs_v2(
    equipment_type_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Regenerate maintenance_programs_v2 for all equipment of this type."""
    from services.maintenance_program_service import MaintenanceProgramService

    try:
        return await MaintenanceProgramService.sync_programs_for_equipment_type(
            equipment_type_id,
            user_id=user_id,
        )
    except Exception as exc:
        logger.exception(
            "Maintenance program v2 sync failed for equipment type %s: %s",
            equipment_type_id,
            exc,
        )
        return {"programs_regenerated": 0, "equipment_ids": [], "errors": [{"error": str(exc)}]}


async def _bump_strategy_version(
    strategy: dict,
    changes: list,
    user_id: Optional[str],
) -> str:
    """
    Increment the strategy version and append to version_history.
    Returns the new version string. The caller is responsible for $set'ing the
    new version on the strategy (it's bundled in the same update_one call).
    """
    new_version = _bump_version(strategy.get("version", "1.0"))
    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "version": new_version,
        "updated_at": now,
        "updated_by": user_id,
        "changes": changes,
    }
    equipment_type_id = strategy["equipment_type_id"]
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {"version": new_version, "updated_at": now},
            "$push": {"version_history": entry},
        },
    )
    await _sync_maintenance_programs_v2(equipment_type_id, user_id=user_id)
    return new_version


