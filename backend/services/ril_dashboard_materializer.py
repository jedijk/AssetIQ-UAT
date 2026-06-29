"""Materialized RIL dashboard snapshots — Wave 4 read model."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from database import db
from services.tenant_schema import tenant_id_from_user


SNAPSHOT_TTL_SECONDS = 300
COLLECTION = "ril_dashboard_snapshots"

_refresh_locks: Dict[Tuple[str, str], asyncio.Lock] = {}
_locks_guard = asyncio.Lock()


def _snapshot_key(user: dict) -> Optional[Tuple[str, str]]:
    tid = tenant_id_from_user(user)
    uid = user.get("id")
    if not tid or not uid:
        return None
    return tid, uid


async def _get_refresh_lock(key: Tuple[str, str]) -> asyncio.Lock:
    async with _locks_guard:
        if key not in _refresh_locks:
            _refresh_locks[key] = asyncio.Lock()
        return _refresh_locks[key]


async def refresh_ril_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    from services.executive_kpi_materializer import get_or_compute_executive_kpis
    from services.ril_dashboard_build import (
        build_ril_data_quality_payload,
        build_ril_executive_payload,
        build_ril_intelligence_payload,
    )
    from services.ril_service import RILService

    oid = owner_id or user.get("owner_id") or user.get("id")
    service = RILService(db)
    stats = await service.get_dashboard_stats(oid)
    reliability_kpis = await get_or_compute_executive_kpis(user, oid)

    payload = {
        "stats": stats,
        "reliability_kpis": reliability_kpis,
        "executive": await build_ril_executive_payload(user, oid, stats, reliability_kpis),
        "intelligence": await build_ril_intelligence_payload(user, oid),
        "data_quality": await build_ril_data_quality_payload(user, oid),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

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
                    "refreshed_at": payload["generated_at"],
                }
            },
            upsert=True,
        )
    return payload


async def get_cached_ril_dashboard(user: dict) -> Optional[Dict[str, Any]]:
    key = _snapshot_key(user)
    if not key:
        return None
    tid, uid = key
    doc = await db[COLLECTION].find_one(
        {
            "tenant_id": tid,
            "user_id": uid,
            "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()},
        },
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def get_stale_ril_dashboard(user: dict) -> Optional[Dict[str, Any]]:
    """Return the latest snapshot even when expired (for stale-while-revalidate)."""
    key = _snapshot_key(user)
    if not key:
        return None
    tid, uid = key
    doc = await db[COLLECTION].find_one(
        {"tenant_id": tid, "user_id": uid},
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def get_or_compute_ril_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_cached_ril_dashboard(user)
    if cached:
        return cached

    key = _snapshot_key(user)
    if not key:
        return await refresh_ril_dashboard(user, owner_id)

    lock = await _get_refresh_lock(key)

    if lock.locked():
        stale = await get_stale_ril_dashboard(user)
        if stale:
            return stale

    async with lock:
        cached = await get_cached_ril_dashboard(user)
        if cached:
            return cached
        return await refresh_ril_dashboard(user, owner_id)
