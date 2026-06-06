"""
Materialized work-item projection cache.

Stores per-user, per-filter snapshots in ``work_item_projections`` to avoid
recomputing the unified merge on every My Tasks poll.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.tenant_schema import tenant_filter, tenant_id_from_user, with_tenant_id
from services.work_item_query import fetch_work_items

logger = logging.getLogger(__name__)

COLLECTION = "work_item_projections"
DEFAULT_TTL_SECONDS = 30


def _cache_key(
    user_id: str,
    *,
    filter_name: str,
    date: Optional[str],
    equipment_id: Optional[str],
    status: Optional[str],
    discipline: Optional[str],
    user: Optional[dict] = None,
) -> str:
    payload = {
        "user_id": user_id,
        "filter": filter_name,
        "date": date,
        "equipment_id": equipment_id,
        "status": status,
        "discipline": discipline,
    }
    tenant_id = tenant_id_from_user(user)
    if tenant_id:
        payload["tenant_id"] = tenant_id
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def get_projected_work_items(
    user_id: str,
    *,
    filter_name: str = "open",
    date: Optional[str] = None,
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    discipline: Optional[str] = None,
    user: Optional[dict] = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Return cached work items or refresh the projection."""
    key = _cache_key(
        user_id,
        filter_name=filter_name,
        date=date,
        equipment_id=equipment_id,
        status=status,
        discipline=discipline,
        user=user,
    )
    now = datetime.now(timezone.utc)

    if not force_refresh:
        query = {"cache_key": key, **tenant_filter(user)}
        cached = await db[COLLECTION].find_one(query, {"_id": 0})
        if cached:
            expires = cached.get("expires_at")
            if expires and isinstance(expires, datetime):
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=timezone.utc)
                if expires > now:
                    return {
                        "items": cached.get("items") or [],
                        "count": cached.get("count", 0),
                        "filter": filter_name,
                        "cached": True,
                        "projection_id": cached.get("id"),
                    }

    items = await fetch_work_items(
        user_id,
        filter_name=filter_name,
        date=date,
        equipment_id=equipment_id,
        status=status,
        discipline=discipline,
        user=user,
    )
    expires_at = now.replace(microsecond=0) + timedelta(seconds=ttl_seconds)
    doc = with_tenant_id({
        "id": key,
        "cache_key": key,
        "user_id": user_id,
        "filter": filter_name,
        "items": items,
        "count": len(items),
        "updated_at": now,
        "expires_at": expires_at,
    }, user)

    await db[COLLECTION].update_one(
        {"cache_key": key, **tenant_filter(user)},
        {"$set": doc},
        upsert=True,
    )

    return {
        "items": items,
        "count": len(items),
        "filter": filter_name,
        "cached": False,
        "projection_id": key,
    }


async def invalidate_user_projections(user_id: str, *, tenant_id: Optional[str] = None) -> int:
    """Drop all projections for a user (call after task/action mutations)."""
    query: Dict[str, Any] = {"user_id": user_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    result = await db[COLLECTION].delete_many(query)
    return result.deleted_count
