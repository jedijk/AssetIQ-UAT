"""Materialized production dashboard snapshots — Wave 5 read model."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import tenant_id_from_user

SNAPSHOT_TTL_SECONDS = 300
COLLECTION = "production_dashboard_snapshots"


def dashboard_cache_key(
    *,
    date: Optional[str],
    from_date: Optional[str],
    to_date: Optional[str],
    shift: Optional[str],
) -> str:
    payload = {
        "date": date or "",
        "from_date": from_date or "",
        "to_date": to_date or "",
        "shift": shift or "",
    }
    raw = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def get_cached_production_dashboard(
    user: dict,
    cache_key: str,
) -> Optional[Dict[str, Any]]:
    tid = tenant_id_from_user(user)
    if not tid:
        return None
    doc = await db[COLLECTION].find_one(
        {
            "tenant_id": tid,
            "cache_key": cache_key,
            "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()},
        },
        {"_id": 0, "payload": 1},
    )
    return doc.get("payload") if doc else None


async def store_production_dashboard_snapshot(
    user: dict,
    cache_key: str,
    payload: Dict[str, Any],
) -> None:
    tid = tenant_id_from_user(user)
    if not tid:
        return
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=SNAPSHOT_TTL_SECONDS)
    ).isoformat()
    await db[COLLECTION].update_one(
        {"tenant_id": tid, "cache_key": cache_key},
        {
            "$set": {
                "tenant_id": tid,
                "cache_key": cache_key,
                "payload": payload,
                "expires_at": expires_at,
                "refreshed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
