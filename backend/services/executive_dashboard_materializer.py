"""
Materialized executive dashboard snapshots — Wave 2 performance hardening.

Full dashboard payloads are cached per tenant/user/period to avoid expensive
live aggregation on every request (target: sub-3s load when snapshot is warm).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import tenant_id_from_user

SNAPSHOT_TTL_SECONDS = 300
COLLECTION = "executive_dashboard_snapshots"


def _snapshot_filter(user: dict, period_days: int) -> Optional[Dict[str, Any]]:
    tid = tenant_id_from_user(user)
    uid = user.get("id")
    if not tid or not uid:
        return None
    return {
        "tenant_id": tid,
        "user_id": uid,
        "period_days": period_days,
    }


async def get_cached_dashboard(
    user: dict,
    period_days: int,
) -> Optional[Dict[str, Any]]:
    base = _snapshot_filter(user, period_days)
    if not base:
        return None
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = await db[COLLECTION].find_one(
        {**base, "expires_at": {"$gt": now_iso}},
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def store_dashboard_snapshot(
    user: dict,
    period_days: int,
    payload: Dict[str, Any],
) -> None:
    base = _snapshot_filter(user, period_days)
    if not base:
        return
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=SNAPSHOT_TTL_SECONDS)
    ).isoformat()
    await db[COLLECTION].update_one(
        base,
        {
            "$set": {
                **base,
                "payload": payload,
                "expires_at": expires_at,
                "refreshed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )


async def refresh_executive_dashboard(
    user: dict,
    period_days: int = 30,
) -> Dict[str, Any]:
    """Rebuild executive dashboard snapshot from operational sources."""
    from services.executive_dashboard_kpis import build_executive_dashboard

    response = await build_executive_dashboard(user, period_days)
    payload = response.model_dump()
    await store_dashboard_snapshot(user, period_days, payload)
    return payload


async def get_or_compute_executive_dashboard(
    user: dict,
    period_days: int = 30,
):
    """Return cached executive dashboard or refresh materialized snapshot."""
    from services.executive_dashboard_models import ExecutiveDashboardResponse

    cached = await get_cached_dashboard(user, period_days)
    if cached:
        return ExecutiveDashboardResponse(**cached)
    payload = await refresh_executive_dashboard(user, period_days)
    return ExecutiveDashboardResponse(**payload)
