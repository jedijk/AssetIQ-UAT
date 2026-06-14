"""
Work execution KPI materialization — projection-driven My Tasks / supervisor metrics.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user

SNAPSHOT_TTL_SECONDS = 300
COLLECTION = "work_execution_kpi_snapshots"


async def compute_work_execution_kpis(user: dict) -> Dict[str, Any]:
    """Compute overdue/pending/completed work item counts for a user scope."""
    now = datetime.now(timezone.utc)
    today_iso = now.date().isoformat()

    pending_filter = merge_tenant_filter(
        {"status": {"$nin": ["completed", "cancelled"]}, "assigned_to": user.get("id")},
        user,
    )
    overdue_filter = merge_tenant_filter(
        {
            "status": {"$nin": ["completed", "cancelled"]},
            "assigned_to": user.get("id"),
            "due_date": {"$lt": today_iso},
        },
        user,
    )
    completed_7d = now - timedelta(days=7)
    completed_filter = merge_tenant_filter(
        {
            "status": "completed",
            "assigned_to": user.get("id"),
            "completed_at": {"$gte": completed_7d.isoformat()},
        },
        user,
    )

    pending_tasks = await db.task_instances.count_documents(pending_filter)
    overdue_tasks = await db.task_instances.count_documents(overdue_filter)
    completed_recent = await db.task_instances.count_documents(completed_filter)

    open_actions = await db.central_actions.count_documents(
        merge_tenant_filter(
            {
                "assigned_to": user.get("id"),
                "status": {"$nin": ["completed", "closed", "cancelled"]},
            },
            user,
        )
    )

    return {
        "pending_tasks": pending_tasks,
        "overdue_tasks": overdue_tasks,
        "completed_tasks_7d": completed_recent,
        "open_actions": open_actions,
        "generated_at": now.isoformat(),
    }


async def get_materialized_work_kpis(user: dict) -> Optional[Dict[str, Any]]:
    tid = tenant_id_from_user(user)
    uid = user.get("id")
    if not tid or not uid:
        return None
    doc = await db[COLLECTION].find_one(
        {
            "tenant_id": tid,
            "user_id": uid,
            "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()},
        },
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def refresh_work_execution_kpis(user: dict) -> Dict[str, Any]:
    payload = await compute_work_execution_kpis(user)
    tid = tenant_id_from_user(user)
    uid = user.get("id")
    if tid and uid:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=SNAPSHOT_TTL_SECONDS)
        ).isoformat()
        await db[COLLECTION].update_one(
            {"tenant_id": tid, "user_id": uid},
            {
                "$set": {
                    "tenant_id": tid,
                    "user_id": uid,
                    "payload": payload,
                    "expires_at": expires_at,
                    "refreshed_at": payload.get("generated_at"),
                }
            },
            upsert=True,
        )
    return payload


async def get_or_compute_work_execution_kpis(user: dict) -> Dict[str, Any]:
    cached = await get_materialized_work_kpis(user)
    if cached:
        return cached
    return await refresh_work_execution_kpis(user)
