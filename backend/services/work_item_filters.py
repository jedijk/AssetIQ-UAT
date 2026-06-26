"""Work-item filter predicates and scheduled-task query builders."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

# How far ahead to include unbridged maintenance in My Tasks.
MAINTENANCE_HORIZON_DAYS = 14
MAX_UNBRIDGED_ITEMS = 50
MAX_TASK_INSTANCES = 100
MAX_ACTION_ITEMS = 100


def _resolve_linked_signal_id(task: dict) -> Optional[str]:
    """Resolve linked observation/threat id from a task instance document."""
    for key in ("observation_id", "threat_id", "source_observation_id"):
        if task.get(key):
            return str(task[key])
    if task.get("created_from_observation") and task.get("source_id"):
        return str(task["source_id"])
    return None


def _is_pm_import_scheduled_task(scheduled_task: dict) -> bool:
    if scheduled_task.get("pm_import_task_id"):
        return True
    return (scheduled_task.get("task_source") or "").lower() == "customer_imported"


def _is_pm_import_task_instance(task: dict) -> bool:
    if (task.get("source_type") or "").lower() == "customer_imported":
        return True
    form_data = task.get("form_data") or {}
    if form_data.get("pm_import_task_id"):
        return True
    for key in ("v2_task_id", "maintenance_program_id", "task_plan_id"):
        value = task.get(key) or ""
        if isinstance(value, str) and value.startswith("pm-import:"):
            return True
    return False


def should_exclude_pm_import_from_my_tasks(
    *,
    scheduled_task: Optional[dict] = None,
    task_instance: Optional[dict] = None,
) -> bool:
    """PM Import belongs on Maintenance Schedule — never show in My Tasks."""
    if scheduled_task is not None:
        return _is_pm_import_scheduled_task(scheduled_task)
    if task_instance is not None:
        return _is_pm_import_task_instance(task_instance)
    return False


def _is_program_scheduled_task(scheduled_task: dict) -> bool:
    """Strategy/program PM rows should only appear after the bridge cron creates instances."""
    if _is_pm_import_scheduled_task(scheduled_task):
        return True
    source = (scheduled_task.get("task_source") or "strategy_generated").lower()
    return source in ("strategy_generated", "customer_imported", "manual")


def should_exclude_unbridged_scheduled_task_from_my_tasks(scheduled_task: dict) -> bool:
    """Unbridged scheduled_tasks are planning artifacts until task_instances exist."""
    return _is_program_scheduled_task(scheduled_task)


def should_exclude_pm_import_overdue_from_my_tasks(
    *,
    scheduled_task: Optional[dict] = None,
    task_instance: Optional[dict] = None,
    now: Optional[datetime] = None,
) -> bool:
    """Deprecated alias — PM import is excluded from My Tasks entirely."""
    return should_exclude_pm_import_from_my_tasks(
        scheduled_task=scheduled_task,
        task_instance=task_instance,
    )


def _user_can_see_item(
    assigned_user_id: Optional[str],
    user_id: str,
) -> bool:
    """Match My Tasks visibility: assigned to user or unassigned."""
    if not assigned_user_id:
        return True
    return assigned_user_id == user_id


def _build_scheduled_task_query(
    *,
    filter_name: str,
    now: datetime,
    today_start: datetime,
    today_end: datetime,
    equipment_id: Optional[str],
) -> Optional[dict]:
    """Return a Mongo query for scheduled_tasks, or None when filter excludes maintenance."""
    if filter_name in ("recurring", "adhoc"):
        return None

    horizon_end = (now + timedelta(days=MAINTENANCE_HORIZON_DAYS)).date().isoformat()
    today_iso = today_start.date().isoformat()

    query: dict = {
        "status": {"$nin": ["completed", "cancelled"]},
    }

    if filter_name == "overdue":
        query["due_date"] = {"$lt": today_iso}
    elif filter_name == "today":
        query["due_date"] = {"$gte": today_iso, "$lt": today_end.date().isoformat()}
    else:
        query["due_date"] = {"$lte": horizon_end}

    if equipment_id:
        query["equipment_id"] = equipment_id

    return query
