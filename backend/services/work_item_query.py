"""
Unified maintenance work-item reads for My Tasks.

Bridges the gap between weekly ``task_instance_bridge`` runs by surfacing open
``scheduled_tasks`` that do not yet have a matching ``task_instances`` row.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.task_instance_bridge import (
    STATUS_MAP,
    _build_default_assignees,
    _build_program_discipline_map,
    _resolve_discipline,
)

logger = logging.getLogger(__name__)

# How far ahead to include unbridged maintenance in My Tasks.
MAINTENANCE_HORIZON_DAYS = 14
MAX_UNBRIDGED_ITEMS = 50


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
        "is_unbridged_maintenance": True,
    }


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
        # open / all / default
        query["due_date"] = {"$lte": horizon_end}

    if equipment_id:
        query["equipment_id"] = equipment_id

    return query


async def fetch_unbridged_maintenance_work_items(
    user_id: str,
    *,
    filter_name: str = "open",
    equipment_id: Optional[str] = None,
    discipline: Optional[str] = None,
    now: Optional[datetime] = None,
) -> List[dict]:
    """Load open scheduled_tasks not yet mirrored in task_instances."""
    now = now or datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    query = _build_scheduled_task_query(
        filter_name=filter_name,
        now=now,
        today_start=today_start,
        today_end=today_end,
        equipment_id=equipment_id,
    )
    if query is None:
        return []

    candidate_tasks = await db.scheduled_tasks.find(query, {"_id": 0}).sort(
        "due_date", 1
    ).to_list(MAX_UNBRIDGED_ITEMS * 2)

    if not candidate_tasks:
        return []

    candidate_ids = [t.get("id") for t in candidate_tasks if t.get("id")]
    existing_set: set = set()
    if candidate_ids:
        existing = await db.task_instances.find(
            {"scheduled_task_id": {"$in": candidate_ids}},
            {"_id": 0, "scheduled_task_id": 1},
        ).to_list(len(candidate_ids))
        existing_set = {e["scheduled_task_id"] for e in existing if e.get("scheduled_task_id")}

    default_assignees = await _build_default_assignees()
    discipline_cache: Dict[str, str] = {}
    program_ids = [
        st.get("maintenance_program_id")
        for st in candidate_tasks
        if st.get("maintenance_program_id")
    ]
    program_disciplines = await _build_program_discipline_map(program_ids)

    items: List[dict] = []
    discipline_lo = discipline.lower() if discipline else None

    for st in candidate_tasks:
        sched_id = st.get("id")
        if not sched_id or sched_id in existing_set:
            continue

        program_disc = program_disciplines.get(st.get("maintenance_program_id"))
        raw_discipline = program_disc or st.get("discipline")
        canonical_discipline = await _resolve_discipline(raw_discipline, discipline_cache)

        if discipline_lo:
            disc = (canonical_discipline or raw_discipline or "").lower()
            if discipline_lo not in disc:
                continue

        assignee_meta = default_assignees.get(canonical_discipline or "") or {}
        assigned_user_id = assignee_meta.get("user_id")
        if not _user_can_see_item(assigned_user_id, user_id):
            continue

        items.append(
            serialize_scheduled_task_as_work_item(
                st,
                canonical_discipline=canonical_discipline,
                assigned_user_id=assigned_user_id,
                assignee=assignee_meta.get("user_name"),
            )
        )
        if len(items) >= MAX_UNBRIDGED_ITEMS:
            break

    return items
