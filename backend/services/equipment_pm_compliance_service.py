"""Equipment-level PM compliance and execution close-out intelligence."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from services.tenant_schema import merge_tenant_filter
from utils.mongo_regex import exact_case_insensitive

PM_TASK_TYPES = {
    "pm",
    "preventive",
    "preventive_maintenance",
    "pdm",
    "predictive",
    "predictive_maintenance",
    "cbm",
    "condition_based",
}

WINDOW_DAYS = 90


def _is_pm_task(doc: dict) -> bool:
    task_type = (doc.get("task_type") or doc.get("task_category") or "").lower().strip()
    if task_type in PM_TASK_TYPES:
        return True
    source = (doc.get("source") or doc.get("origin") or "").lower()
    return source in {"maintenance_program", "strategy", "pm_import", "scheduled_pm"}


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    return None


def _in_window(doc: dict, window_start: datetime) -> bool:
    for key in ("scheduled_date", "due_date", "completed_at", "created_at"):
        dt = _parse_dt(doc.get(key))
        if dt and dt >= window_start:
            return True
    return False


def _technician_feedback(doc: dict) -> str:
    parts = []
    for key in ("completion_notes", "follow_up_notes", "notes", "close_out_notes"):
        val = (doc.get(key) or "").strip()
        if val and val not in parts:
            parts.append(val)
    return " · ".join(parts)


def _normalize_execution(doc: dict, source: str) -> dict:
    status = (doc.get("status") or "pending").lower()
    feedback = _technician_feedback(doc)
    return {
        "id": doc.get("id") or str(doc.get("_id", "")),
        "title": doc.get("name") or doc.get("task_name") or doc.get("title") or "PM Task",
        "status": status,
        "task_type": (doc.get("task_type") or doc.get("task_category") or "PM").upper(),
        "scheduled_date": doc.get("scheduled_date") or doc.get("due_date"),
        "completed_at": doc.get("completed_at"),
        "completion_notes": doc.get("completion_notes") or "",
        "follow_up_notes": doc.get("follow_up_notes") or "",
        "technician_feedback": feedback,
        "source": source,
    }


def _build_ai_summary(
    *,
    equipment_name: str,
    compliance_pct: float,
    completed: int,
    total: int,
    overdue: int,
    executions: List[dict],
) -> str:
    if total == 0:
        return (
            f"No preventive maintenance executions were scheduled for {equipment_name} "
            f"in the last {WINDOW_DAYS} days. Compliance cannot be calculated until PM work is planned."
        )

    tone = "strong" if compliance_pct >= 85 else "needs improvement"
    if compliance_pct >= 85:
        headline = f"PM compliance is {tone} at {compliance_pct:.0f}%"
    elif compliance_pct >= 60:
        headline = f"PM compliance is moderate at {compliance_pct:.0f}% and should be monitored"
    else:
        headline = f"PM compliance {tone} at {compliance_pct:.0f}%"

    feedback_items = [
        ex for ex in executions
        if ex.get("technician_feedback") and ex.get("status") == "completed"
    ]
    feedback_lines = []
    for ex in feedback_items[:3]:
        snippet = ex["technician_feedback"]
        if len(snippet) > 120:
            snippet = snippet[:117] + "..."
        feedback_lines.append(f"• {ex.get('title', 'PM task')}: \"{snippet}\"")

    parts = [
        f"{headline} for {equipment_name} over the last {WINDOW_DAYS} days "
        f"({completed} of {total} PM executions completed).",
    ]
    if overdue:
        parts.append(f"{overdue} PM task(s) are overdue and should be prioritized.")
    if feedback_lines:
        parts.append("Key technician feedback from close-outs:")
        parts.extend(feedback_lines)
    elif completed:
        parts.append("Completed PM work has limited close-out commentary — encourage technicians to capture findings.")
    return "\n".join(parts)


async def get_equipment_pm_compliance(user: dict, equipment_id: str) -> Dict[str, Any]:
    node = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": equipment_id}, user),
        {"_id": 0, "id": 1, "name": 1},
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")

    equipment_name = node.get("name") or equipment_id
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=WINDOW_DAYS)

    eq_match = {
        "$or": [
            {"equipment_id": equipment_id},
            {"linked_equipment_id": equipment_id},
            {"equipment_name": exact_case_insensitive(equipment_name)},
        ]
    }
    scoped = merge_tenant_filter(eq_match, user)

    scheduled_raw, instances_raw = await asyncio.gather(
        db.scheduled_tasks.find(scoped, {"_id": 0}).to_list(500),
        db.task_instances.find(scoped, {"_id": 0}).to_list(500),
    )

    seen_ids: set[str] = set()
    executions: List[dict] = []

    for doc in scheduled_raw + instances_raw:
        if not _is_pm_task(doc):
            continue
        if not _in_window(doc, window_start):
            continue
        eid = doc.get("id")
        if eid and eid in seen_ids:
            continue
        if eid:
            seen_ids.add(eid)
        executions.append(_normalize_execution(doc, "scheduled_tasks" if doc in scheduled_raw else "task_instances"))

    def sort_key(ex: dict) -> datetime:
        for key in ("completed_at", "scheduled_date"):
            dt = _parse_dt(ex.get(key))
            if dt:
                return dt
        return datetime.min.replace(tzinfo=timezone.utc)

    executions.sort(key=sort_key, reverse=True)

    total = len(executions)
    completed = len([ex for ex in executions if ex.get("status") == "completed"])
    overdue = len([
        ex for ex in executions
        if ex.get("status") not in ("completed", "cancelled")
        and _parse_dt(ex.get("scheduled_date")) and _parse_dt(ex.get("scheduled_date")) < now
    ])
    compliance_pct = round(completed / total * 100, 1) if total else 0.0

    ai_summary = _build_ai_summary(
        equipment_name=equipment_name,
        compliance_pct=compliance_pct,
        completed=completed,
        total=total,
        overdue=overdue,
        executions=executions,
    )

    return {
        "equipment_id": equipment_id,
        "equipment_name": equipment_name,
        "compliance_pct": compliance_pct,
        "completed_count": completed,
        "total_count": total,
        "overdue_count": overdue,
        "window_days": WINDOW_DAYS,
        "ai_summary": ai_summary,
        "executions": executions,
        "generated_at": now.isoformat(),
    }
