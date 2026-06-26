"""Work-item serializers, dedupe keys, and sort helpers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.task_instance_bridge import STATUS_MAP


def _parse_due_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def _safe_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def safe_isoformat(value: Any) -> Optional[str]:
    """Safely convert a datetime or string to ISO format string."""
    return _safe_iso(value)


def serialize_scheduled_task_as_work_item(
    scheduled_task: dict,
    *,
    canonical_discipline: Optional[str] = None,
    assigned_user_id: Optional[str] = None,
    assignee: Optional[str] = None,
) -> dict:
    """Shape a scheduled_task into the My Tasks list item format."""
    sched_id = scheduled_task.get("id") or ""
    due_dt = _parse_due_date(scheduled_task.get("due_date"))
    raw_status = scheduled_task.get("status", "scheduled")
    mapped_status = STATUS_MAP.get(raw_status, "pending")
    if due_dt and due_dt < datetime.now(timezone.utc) and mapped_status == "pending":
        mapped_status = "overdue"

    return {
        "id": f"sched:{sched_id}",
        "scheduled_task_id": sched_id,
        "title": scheduled_task.get("task_name") or "Maintenance task",
        "description": scheduled_task.get("task_description") or "",
        "status": mapped_status,
        "priority": scheduled_task.get("priority") or "medium",
        "due_date": _safe_iso(due_dt),
        "scheduled_date": _safe_iso(due_dt),
        "equipment_id": scheduled_task.get("equipment_id"),
        "equipment_name": scheduled_task.get("equipment_name") or "",
        "asset": scheduled_task.get("equipment_name") or "",
        "equipment_tag": scheduled_task.get("equipment_tag"),
        "mitigation_strategy": canonical_discipline or scheduled_task.get("discipline") or "maintenance",
        "type": canonical_discipline or scheduled_task.get("discipline") or "maintenance",
        "discipline": canonical_discipline or scheduled_task.get("discipline") or "",
        "is_recurring": False,
        "frequency": "",
        "source": "maintenance",
        "source_type": "scheduled_task",
        "assigned_user_id": assigned_user_id,
        "assigned_team": "",
        "assignee": assignee or "",
        "last_completed": None,
        "form_fields": [],
        "form_template_name": "",
        "form_documents": [],
        "template": {},
        "estimated_duration_minutes": scheduled_task.get("estimated_duration_minutes"),
        "can_quick_complete": True,
        "action_type": None,
        "risk_score": None,
        "rpn": None,
        "maintenance_program_id": scheduled_task.get("maintenance_program_id"),
        "v2_task_id": scheduled_task.get("v2_task_id"),
        "is_unbridged_maintenance": True,
    }


def serialize_task(task: dict) -> dict:
    """Serialize a task instance for API response."""
    if not task:
        return None

    title = task.get("title") or task.get("task_template_name") or "Untitled Task"

    return {
        "id": str(task.get("_id", "")),
        "title": title,
        "description": task.get("description", ""),
        "status": task.get("status", "scheduled"),
        "priority": task.get("priority", "medium"),
        "due_date": safe_isoformat(task.get("due_date")),
        "scheduled_date": safe_isoformat(task.get("scheduled_date")),
        "equipment_id": str(task.get("equipment_id", "")) if task.get("equipment_id") else None,
        "equipment_name": task.get("equipment_name", ""),
        "asset": task.get("equipment_name", ""),
        "mitigation_strategy": task.get("mitigation_strategy") or task.get("discipline", ""),
        "type": task.get("mitigation_strategy") or task.get("discipline", ""),
        "discipline": task.get("discipline", ""),
        "is_recurring": task.get("is_recurring", False),
        "frequency": task.get("frequency_display", ""),
        "source": task.get("source", "manual"),
        "source_type": task.get("source_type", "task"),
        "assigned_user_id": str(task.get("assigned_user_id", "")) if task.get("assigned_user_id") else None,
        "assigned_team": task.get("assigned_team", ""),
        "assignee": task.get("assignee", ""),
        "last_completed": safe_isoformat(task.get("last_completed")),
        "form_fields": task.get("form_fields", []),
        "form_template_name": task.get("form_template_name", ""),
        "form_documents": task.get("form_documents", []),
        "template": task.get("template", {}),
        "estimated_duration_minutes": task.get("estimated_duration_minutes"),
        "can_quick_complete": not task.get("form_fields") and not task.get("template", {}).get("form_fields"),
        "action_type": task.get("action_type"),
        "risk_score": task.get("risk_score"),
        "rpn": task.get("rpn"),
        "equipment_tag": task.get("equipment_tag"),
        "photo_extraction_config": task.get("photo_extraction_config"),
        "scheduled_task_id": task.get("scheduled_task_id"),
        "maintenance_program_id": task.get("maintenance_program_id"),
        "v2_task_id": task.get("v2_task_id"),
        "is_unbridged_maintenance": False,
        "work_signal": task.get("work_signal"),
    }


def serialize_action_as_task(action: dict) -> dict:
    """Serialize a central action as a task item for the My Tasks list."""
    if not action:
        return None

    due_date = action.get("due_date")
    if due_date and isinstance(due_date, str):
        try:
            due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            due_date = None

    status_map = {
        "open": "planned",
        "in_progress": "in_progress",
        "completed": "completed",
    }

    return {
        "id": action.get("id", ""),
        "title": action.get("title", "Untitled Action"),
        "description": action.get("description", ""),
        "status": status_map.get(action.get("status", "open"), "planned"),
        "priority": action.get("priority", "medium"),
        "due_date": due_date.isoformat() if due_date else None,
        "scheduled_date": None,
        "equipment_id": None,
        "equipment_name": action.get("source_name", ""),
        "asset": action.get("source_name", ""),
        "mitigation_strategy": action.get("action_type", "corrective"),
        "type": action.get("action_type", "corrective"),
        "discipline": action.get("discipline", ""),
        "is_recurring": False,
        "frequency": "",
        "source": action.get("source_type", "observation"),
        "source_type": "action",
        "source_id": action.get("source_id", ""),
        "assigned_user_id": None,
        "assigned_team": "",
        "assignee": action.get("assignee", ""),
        "last_completed": None,
        "form_fields": [],
        "form_documents": action.get("form_documents", []),
        "template": {},
        "estimated_duration_minutes": None,
        "can_quick_complete": True,
        "action_type": action.get("action_type"),
        "comments": action.get("comments", ""),
        "risk_score": action.get("threat_risk_score") or action.get("risk_score"),
        "rpn": action.get("threat_rpn") or action.get("rpn"),
        "equipment_tag": action.get("equipment_tag"),
        "is_unbridged_maintenance": False,
    }


def _work_item_dedupe_key(item: dict) -> tuple:
    """Fingerprint for deduping task_instances vs unbridged scheduled_tasks."""
    sched_id = item.get("scheduled_task_id")
    equipment_id = item.get("equipment_id")
    due = item.get("due_date") or item.get("scheduled_date")
    program_ref = (
        item.get("v2_task_id")
        or item.get("program_task_id")
        or item.get("maintenance_program_id")
        or item.get("task_plan_id")
    )
    return (sched_id, equipment_id, program_ref, due)


def _merge_work_items_prefer_instances(
    instance_items: List[dict],
    unbridged_items: List[dict],
) -> List[dict]:
    """Merge lists; task_instance rows win over unbridged duplicates."""
    merged = list(instance_items)
    seen_sched_ids = {
        t.get("scheduled_task_id") for t in instance_items if t.get("scheduled_task_id")
    }
    seen_fingerprints = {_work_item_dedupe_key(t) for t in instance_items}

    for item in unbridged_items:
        sched_id = item.get("scheduled_task_id")
        if sched_id and sched_id in seen_sched_ids:
            continue
        fp = _work_item_dedupe_key(item)
        if fp in seen_fingerprints and fp != (None, None, None, None):
            continue
        merged.append(item)
        if sched_id:
            seen_sched_ids.add(sched_id)
        seen_fingerprints.add(fp)
    return merged


def work_item_sort_key(item: dict, now: datetime) -> tuple:
    """Sort combined work items: risk → status → priority → due date."""
    risk_score = item.get("risk_score") or 0
    risk_val = -risk_score
    rpn = item.get("rpn") or 0
    rpn_val = -rpn

    status_order = {"overdue": 0, "in_progress": 1, "planned": 2, "scheduled": 2, "pending": 2}
    status_val = status_order.get(item.get("status", "planned"), 2)

    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    priority_val = priority_order.get(item.get("priority", "medium"), 2)

    due_date = item.get("due_date")
    if due_date:
        try:
            due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
            if due_dt < now:
                status_val = 0
            due_val = due_dt.timestamp()
        except (ValueError, TypeError):
            due_val = float("inf")
    else:
        due_val = float("inf")

    return (risk_val, rpn_val, status_val, priority_val, due_val)
