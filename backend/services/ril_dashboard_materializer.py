"""Materialized RIL dashboard snapshots — Wave 4 read model."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import tenant_id_from_user


SNAPSHOT_TTL_SECONDS = 300
COLLECTION = "ril_dashboard_snapshots"


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


async def get_or_compute_ril_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_cached_ril_dashboard(user)
    if cached:
        return cached
    return await refresh_ril_dashboard(user, owner_id)
