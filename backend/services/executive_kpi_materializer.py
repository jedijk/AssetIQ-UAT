"""
Materialized executive reliability KPI snapshots — Wave 2 performance hardening.

Avoids repeated live count_documents / aggregation on every dashboard load.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import tenant_id_from_user

SNAPSHOT_TTL_SECONDS = 300
COLLECTION = "executive_kpi_snapshots"


def _snapshot_key(user: dict) -> Optional[tuple]:
    tid = tenant_id_from_user(user)
    uid = user.get("id")
    if not tid or not uid:
        return None
    return tid, uid


async def get_materialized_kpis(user: Optional[dict]) -> Optional[Dict[str, Any]]:
    key = _snapshot_key(user) if user else None
    if not key:
        return None
    tid, uid = key
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = await db[COLLECTION].find_one(
        {
            "tenant_id": tid,
            "user_id": uid,
            "expires_at": {"$gt": now_iso},
        },
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def refresh_executive_kpis(
    user: dict,
    owner_id: Optional[str] = None,
) -> Dict[str, Any]:
    from services.executive_reliability_kpis import compute_executive_reliability_kpis

    payload = await compute_executive_reliability_kpis(owner_id, user=user)
    key = _snapshot_key(user)
    if key:
        tid, uid = key
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


async def get_or_compute_executive_kpis(
    user: dict,
    owner_id: Optional[str] = None,
    *,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    if not force_refresh:
        cached = await get_materialized_kpis(user)
        if cached:
            return cached
    return await refresh_executive_kpis(user, owner_id)
