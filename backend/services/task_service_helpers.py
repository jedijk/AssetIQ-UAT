"""Task service serializers and date helpers — extracted from task_service.py (WS4)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict


def safe_isoformat(value):
    """Safely convert datetime to ISO format string with UTC timezone suffix."""
    if value is None:
        return None
    if isinstance(value, str):
        if value and not value.endswith("Z") and "+" not in value and "-" not in value[-6:]:
            return value + "+00:00"
        return value
    if hasattr(value, "isoformat"):
        iso_str = value.isoformat()
        if not iso_str.endswith("Z") and "+" not in iso_str and "-" not in iso_str[-6:]:
            iso_str += "+00:00"
        return iso_str
    return str(value)


def calculate_next_due(base_date: datetime, interval_value: Any, interval_unit: str) -> datetime:
    """Calculate next due date based on interval."""
    if isinstance(base_date, str):
        base_date = datetime.fromisoformat(base_date.replace("Z", "+00:00"))
    try:
        iv = int(interval_value) if interval_value is not None else 1
    except (TypeError, ValueError):
        iv = 1
    unit = (interval_unit or "days").lower() if isinstance(interval_unit, str) else "days"

    if unit == "hours":
        return base_date + timedelta(hours=iv)
    if unit == "days":
        return base_date + timedelta(days=iv)
    if unit == "weeks":
        return base_date + timedelta(weeks=iv)
    if unit == "months":
        return base_date + timedelta(days=iv * 30)
    if unit == "years":
        return base_date + timedelta(days=iv * 365)
    return base_date + timedelta(days=iv)


def serialize_template(doc: Dict) -> Dict[str, Any]:
    """Serialize template document."""
    return {
        "id": doc.get("id") or str(doc["_id"]),
        "name": doc["name"],
        "description": doc.get("description"),
        "discipline": doc["discipline"],
        "mitigation_strategy": doc["mitigation_strategy"],
        "equipment_type_ids": doc.get("equipment_type_ids", []),
        "failure_mode_ids": doc.get("failure_mode_ids", []),
        "frequency_type": doc.get("frequency_type", "time_based"),
        "default_interval": doc.get("default_interval", 30),
        "default_unit": doc.get("default_unit", "days"),
        "estimated_duration_minutes": doc.get("estimated_duration_minutes"),
        "procedure_steps": doc.get("procedure_steps", []),
        "safety_requirements": doc.get("safety_requirements", []),
        "tools_required": doc.get("tools_required", []),
        "spare_parts": doc.get("spare_parts", []),
        "form_template_id": doc.get("form_template_id"),
        "tags": doc.get("tags", []),
        "is_adhoc": doc.get("is_adhoc", False),
        "is_active": doc.get("is_active", True),
        "usage_count": doc.get("usage_count", 0),
        "created_at": safe_isoformat(doc.get("created_at")),
        "updated_at": safe_isoformat(doc.get("updated_at")),
    }


def serialize_plan(doc: Dict) -> Dict[str, Any]:
    """Serialize plan document."""
    return {
        "id": doc.get("id") or str(doc["_id"]),
        "equipment_id": doc["equipment_id"],
        "equipment_name": doc.get("equipment_name"),
        "task_template_id": doc["task_template_id"],
        "task_template_name": doc.get("task_template_name"),
        "form_template_id": doc.get("form_template_id"),
        "form_template_name": doc.get("form_template_name"),
        "efm_id": doc.get("efm_id"),
        "frequency_type": doc["frequency_type"],
        "interval_value": doc.get("interval_value"),
        "interval_unit": doc.get("interval_unit"),
        "trigger_condition": doc.get("trigger_condition"),
        "assigned_team": doc.get("assigned_team"),
        "assigned_user_id": doc.get("assigned_user_id"),
        "effective_from": safe_isoformat(doc.get("effective_from")),
        "effective_until": safe_isoformat(doc.get("effective_until")),
        "last_executed_at": safe_isoformat(doc.get("last_executed_at")),
        "next_due_date": safe_isoformat(doc.get("next_due_date")),
        "execution_count": doc.get("execution_count", 0),
        "notes": doc.get("notes"),
        "is_active": doc.get("is_active", True),
        "is_adhoc": doc.get("is_adhoc", False),
        "created_at": safe_isoformat(doc.get("created_at")),
        "updated_at": safe_isoformat(doc.get("updated_at")),
    }


def serialize_instance(doc: Dict) -> Dict[str, Any]:
    """Serialize instance document."""
    task_plan_id = doc.get("task_plan_id")
    if task_plan_id and hasattr(task_plan_id, "__str__"):
        task_plan_id = str(task_plan_id)

    return {
        "id": str(doc["_id"]),
        "task_plan_id": task_plan_id,
        "task_template_id": doc.get("task_template_id"),
        "task_template_name": doc.get("task_template_name"),
        "equipment_id": doc.get("equipment_id"),
        "equipment_name": doc.get("equipment_name"),
        "efm_id": doc.get("efm_id"),
        "scheduled_date": safe_isoformat(doc.get("scheduled_date")),
        "due_date": safe_isoformat(doc.get("due_date")),
        "status": doc.get("status", "pending"),
        "priority": doc.get("priority", "medium"),
        "assigned_team": doc.get("assigned_team"),
        "assigned_user_id": doc.get("assigned_user_id"),
        "discipline": doc.get("discipline"),
        "estimated_duration_minutes": doc.get("estimated_duration_minutes"),
        "started_at": safe_isoformat(doc.get("started_at")),
        "completed_at": safe_isoformat(doc.get("completed_at")),
        "actual_duration_minutes": doc.get("actual_duration_minutes"),
        "completion_notes": doc.get("completion_notes"),
        "issues_found": doc.get("issues_found", []),
        "follow_up_required": doc.get("follow_up_required", False),
        "follow_up_notes": doc.get("follow_up_notes"),
        "notes": doc.get("notes"),
        "created_at": safe_isoformat(doc.get("created_at")),
        "updated_at": safe_isoformat(doc.get("updated_at")),
    }
