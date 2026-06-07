"""
One-off cleanup: cancel overdue rows that surface in My Tasks.

Targets open task_instances, scheduled_tasks, and (optionally) central_actions
whose due date is before today/start-of-day UTC.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

CANCEL_REASON = "One-off flush: cleared overdue My Tasks backlog"
OPEN_INSTANCE_STATUSES = {"$nin": ["completed", "cancelled", "completed_offline"]}
OPEN_SCHEDULED_STATUSES = {"$nin": ["completed", "cancelled"]}


def _today_bounds(now: Optional[datetime] = None) -> tuple[datetime, str, str]:
    now = now or datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_start, today_start.date().isoformat(), now.isoformat()


def _with_tenant(base: dict, tenant_id: Optional[str]) -> dict:
    if not tenant_id:
        return base
    return {"$and": [base, {"tenant_id": tenant_id}]}


def overdue_my_tasks_filters(
    *,
    now: Optional[datetime] = None,
    tenant_id: Optional[str] = None,
    include_actions: bool = True,
) -> Dict[str, dict]:
    """Mongo filters for collections that feed the My Tasks overdue view."""
    today_start, today_iso, now_iso = _today_bounds(now)

    scheduled_tasks = _with_tenant(
        {
            "status": OPEN_SCHEDULED_STATUSES,
            "due_date": {"$lt": today_iso},
        },
        tenant_id,
    )

    task_instances = _with_tenant(
        {
            "status": OPEN_INSTANCE_STATUSES,
            "$or": [
                {"status": "overdue"},
                {"due_date": {"$lt": today_start}},
            ],
        },
        tenant_id,
    )

    filters: Dict[str, dict] = {
        "scheduled_tasks": scheduled_tasks,
        "task_instances": task_instances,
    }

    if include_actions:
        filters["central_actions"] = _with_tenant(
            {
                "status": {"$in": ["open", "in_progress"]},
                "$and": [
                    {"due_date": {"$lt": now_iso}},
                    {"due_date": {"$nin": [None, ""]}},
                ],
            },
            tenant_id,
        )

    return filters


async def count_overdue_my_tasks_backlog(
    db,
    *,
    now: Optional[datetime] = None,
    tenant_id: Optional[str] = None,
    include_actions: bool = True,
) -> Dict[str, int]:
    filters = overdue_my_tasks_filters(
        now=now,
        tenant_id=tenant_id,
        include_actions=include_actions,
    )
    counts: Dict[str, int] = {}
    for name, query in filters.items():
        counts[name] = await db[name].count_documents(query)
    counts["total"] = sum(counts.values())
    return counts


async def flush_overdue_my_tasks_backlog(
    db,
    *,
    dry_run: bool = True,
    now: Optional[datetime] = None,
    tenant_id: Optional[str] = None,
    include_actions: bool = True,
) -> Dict[str, Any]:
    """Cancel overdue scheduled_tasks / task_instances / central_actions."""
    today_start, today_iso, now_iso = _today_bounds(now)
    filters = overdue_my_tasks_filters(
        now=now,
        tenant_id=tenant_id,
        include_actions=include_actions,
    )

    counts_before = await count_overdue_my_tasks_backlog(
        db,
        now=now,
        tenant_id=tenant_id,
        include_actions=include_actions,
    )

    if dry_run:
        return {
            "dry_run": True,
            "counts_before": counts_before,
            "modified": {key: 0 for key in filters},
            "cancel_reason": CANCEL_REASON,
        }

    modified: Dict[str, int] = {}

    st_result = await db.scheduled_tasks.update_many(
        filters["scheduled_tasks"],
        {
            "$set": {
                "status": "cancelled",
                "notes": CANCEL_REASON,
                "updated_at": now_iso,
                "cancelled_at": now_iso,
                "cancelled_reason": CANCEL_REASON,
            }
        },
    )
    modified["scheduled_tasks"] = st_result.modified_count

    ti_result = await db.task_instances.update_many(
        filters["task_instances"],
        {
            "$set": {
                "status": "cancelled",
                "updated_at": today_start,
                "cancelled_at": today_start,
                "cancelled_reason": CANCEL_REASON,
            }
        },
    )
    modified["task_instances"] = ti_result.modified_count

    if include_actions and "central_actions" in filters:
        ca_result = await db.central_actions.update_many(
            filters["central_actions"],
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": now_iso,
                    "cancelled_at": now_iso,
                    "cancelled_reason": CANCEL_REASON,
                }
            },
        )
        modified["central_actions"] = ca_result.modified_count

    counts_after = await count_overdue_my_tasks_backlog(
        db,
        now=now,
        tenant_id=tenant_id,
        include_actions=include_actions,
    )

    return {
        "dry_run": False,
        "counts_before": counts_before,
        "counts_after": counts_after,
        "modified": modified,
        "cancel_reason": CANCEL_REASON,
    }
