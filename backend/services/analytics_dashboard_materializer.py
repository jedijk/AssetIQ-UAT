"""Materialized analytics dashboard snapshots — Platform 1.0 WS6."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Set

from database import db
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

SNAPSHOT_TTL_SECONDS = 600
COLLECTION = "analytics_dashboard_snapshots"


async def _scoped_equipment_ids(user: dict) -> Set[str]:
    from database import installation_filter

    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return set()
    return await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user.get("id")
    )


async def compute_analytics_dashboard(user: dict) -> Dict[str, Any]:
    from services.analytics_service import AnalyticsService

    equipment_ids = await _scoped_equipment_ids(user)
    service = AnalyticsService(db)
    return await service.get_full_dashboard(
        user.get("user_id"),
        equipment_ids=equipment_ids,
        user=user,
    )


async def get_cached_analytics_dashboard(user: dict) -> Optional[Dict[str, Any]]:
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


async def refresh_analytics_dashboard(user: dict) -> Dict[str, Any]:
    payload = await compute_analytics_dashboard(user)
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


async def get_or_compute_analytics_dashboard(user: dict) -> Dict[str, Any]:
    cached = await get_cached_analytics_dashboard(user)
    if cached:
        return cached
    return await refresh_analytics_dashboard(user)
