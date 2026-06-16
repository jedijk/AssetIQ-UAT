"""Maintenance strategy v2 — program/scheduled-task propagation (service layer)."""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.program_task_resolution import (
    scheduler_program_ids_for_equipment_type,
    scheduler_program_ids_for_failure_mode,
    scheduler_program_ids_for_task_template,
)
from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.scheduler_helpers import (
    normalize_program_criticality,
    program_is_strategy_backed,
)

logger = logging.getLogger(__name__)

# ============= Strategy → Program Propagation =============

_FREQUENCY_DAYS = {
    "continuous": 1, "daily": 1, "weekly": 7, "bi_weekly": 14,
    "monthly": 30, "quarterly": 90, "semi_annual": 180, "annual": 365,
    "biennial": 730, "on_condition": 30,
}


def _v2_criticality(program: dict) -> str:
    return normalize_program_criticality(
        program.get("criticality_level") or program.get("criticality")
    )


async def _propagate_task_template_to_v2_programs(
    equipment_type_id: str,
    task_template: dict,
    new_strategy_version: str,
) -> int:
    """Push strategy task template fields into v2 nested program tasks."""
    task_template_id = task_template.get("id")
    if not task_template_id:
        return 0

    freq_matrix = task_template.get("frequency_matrix", {}) or {}
    now = datetime.now(timezone.utc).isoformat()
    modified = 0

    programs = await db.maintenance_programs_v2.find(
        {
            "equipment_type_id": equipment_type_id,
            "tasks.traceability.task_template_id": task_template_id,
        }
    ).to_list(5000)

    for prog in programs:
        criticality = _v2_criticality(prog)
        frequency = freq_matrix.get(criticality, "monthly")
        freq_days = _FREQUENCY_DAYS.get(frequency, 30)
        result = await db.maintenance_programs_v2.update_one(
            {"_id": prog["_id"]},
            {
                "$set": {
                    "tasks.$[t].task_title": task_template.get("name"),
                    "tasks.$[t].task_description": task_template.get("description"),
                    "tasks.$[t].task_type": task_template.get("task_type", "preventive"),
                    "tasks.$[t].estimated_duration_hours": task_template.get(
                        "duration_hours", 1.0
                    ),
                    "tasks.$[t].frequency": frequency,
                    "tasks.$[t].frequency_days": freq_days,
                    "tasks.$[t].discipline": task_template.get("discipline"),
                    "source_strategy_version": new_strategy_version,
                    "updated_at": now,
                }
            },
            array_filters=[{"t.traceability.task_template_id": task_template_id}],
        )
        modified += result.modified_count

    return modified


async def _propagate_task_template_to_programs(
    equipment_type_id: str,
    task_template: dict,
    new_strategy_version: str,
):
    """
    When a task template is added/edited on a strategy, propagate the changed
    fields to v2 program tasks (and legacy flat rows when dual-write is enabled).
    """
    from pymongo import UpdateOne

    task_template_id = task_template.get("id")
    if not task_template_id:
        return 0

    modified = await _propagate_task_template_to_v2_programs(
        equipment_type_id, task_template, new_strategy_version
    )

    if not should_sync_legacy_maintenance_programs():
        return modified

    freq_matrix = task_template.get("frequency_matrix", {}) or {}
    now = datetime.now(timezone.utc).isoformat()

    programs = await db.maintenance_programs.find(
        {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id}
    ).to_list(5000)

    operations = []
    for prog in programs:
        criticality = prog.get("criticality") or "low"
        frequency = freq_matrix.get(criticality, prog.get("frequency", "monthly"))
        freq_days = _FREQUENCY_DAYS.get(frequency, 30)

        set_fields = {
            "task_name": task_template.get("name", prog.get("task_name")),
            "task_description": task_template.get("description"),
            "task_type": task_template.get("task_type", prog.get("task_type")),
            "estimated_duration_hours": task_template.get(
                "duration_hours", prog.get("estimated_duration_hours", 1.0)
            ),
            "frequency": frequency,
            "frequency_days": freq_days,
            "discipline": task_template.get("discipline"),
            "skills_required": task_template.get("skills_required", []),
            "strategy_version": new_strategy_version,
            "updated_at": now,
        }
        operations.append(UpdateOne({"_id": prog["_id"]}, {"$set": set_fields}))

    if operations:
        result = await db.maintenance_programs.bulk_write(operations, ordered=False)
        modified += result.modified_count

    return modified


async def _deactivate_programs_for_task(equipment_type_id: str, task_template_id: str):
    """Mark v2 (and optionally legacy) program tasks inactive for a removed template."""
    now = datetime.now(timezone.utc).isoformat()
    v2_result = await db.maintenance_programs_v2.update_many(
        {
            "equipment_type_id": equipment_type_id,
            "tasks.traceability.task_template_id": task_template_id,
        },
        {
            "$set": {
                "tasks.$[t].is_active": False,
                "updated_at": now,
            }
        },
        array_filters=[{"t.traceability.task_template_id": task_template_id}],
    )
    modified = v2_result.modified_count

    if should_sync_legacy_maintenance_programs():
        legacy = await db.maintenance_programs.update_many(
            {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id},
            {"$set": {"is_active": False, "updated_at": now}},
        )
        modified += legacy.modified_count

    return modified


async def _toggle_programs_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
    enabled: bool,
):
    """Activate/deactivate v2 tasks (and legacy rows when dual-write is enabled)."""
    now = datetime.now(timezone.utc).isoformat()
    v2_result = await db.maintenance_programs_v2.update_many(
        {
            "equipment_type_id": equipment_type_id,
            "tasks.traceability.failure_mode_id": failure_mode_id,
        },
        {
            "$set": {
                "tasks.$[t].is_active": enabled,
                "updated_at": now,
            }
        },
        array_filters=[{"t.traceability.failure_mode_id": failure_mode_id}],
    )
    modified = v2_result.modified_count

    if should_sync_legacy_maintenance_programs():
        legacy = await db.maintenance_programs.update_many(
            {
                "equipment_type_id": equipment_type_id,
                "failure_mode_id": failure_mode_id,
            },
            {"$set": {"is_active": enabled, "updated_at": now}},
        )
        modified += legacy.modified_count

    return modified


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

    program_ids = await scheduler_program_ids_for_task_template(
        equipment_type_id, task_template_id
    )
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
    program_ids = await scheduler_program_ids_for_task_template(
        equipment_type_id, task_template_id
    )
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
    program_ids = await scheduler_program_ids_for_task_template(
        equipment_type_id, task_template_id
    )
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
    program_ids = await scheduler_program_ids_for_failure_mode(
        equipment_type_id, failure_mode_id
    )
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
    program_ids = await scheduler_program_ids_for_equipment_type(equipment_type_id)
    if not program_ids:
        return 0
    result = await db.scheduled_tasks.delete_many({
        "maintenance_program_id": {"$in": program_ids},
        "status": OPEN_TASK_STATUSES_FILTER,
    })
    return result.deleted_count


async def _cancel_open_scheduled_tasks_for_strategy(equipment_type_id: str):
    """Cancel every OPEN scheduled_task linked to the given equipment-type strategy."""
    program_ids = await scheduler_program_ids_for_equipment_type(equipment_type_id)
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

from services.strategy_propagation import resync_programs_with_strategy as _resync_programs_with_strategy


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
    """Regenerate maintenance_programs_v2 and refresh timeline for applied equipment."""
    from services.maintenance_scheduler_sync import propagate_strategy_schedule_updates

    try:
        schedule_refresh = await propagate_strategy_schedule_updates(
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

    return {
        "programs_regenerated": schedule_refresh.get("programs_regenerated", 0),
        "equipment_ids": [],
        "scheduled_tasks_created": schedule_refresh.get("scheduled_tasks_created", 0),
        "schedule_refresh": schedule_refresh,
    }


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
            "$set": {
                "version": new_version,
                "updated_at": now,
                "strategy_needs_apply": True,
            },
            "$push": {"version_history": entry},
        },
    )
    return new_version


