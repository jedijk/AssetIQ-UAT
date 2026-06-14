"""Tenant-scoped Mongo helpers for AI failure-mode suggestions — Wave 12."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from database import db
from services.tenant_schema import merge_tenant_filter, with_tenant_id

CACHE_COLLECTION = "ai_fm_suggestion_cache"


def scoped(user: Optional[dict], query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return merge_tenant_filter(query or {}, user)


async def find_cache_doc(user: Optional[dict], cache_key: str) -> Optional[dict]:
    return await db[CACHE_COLLECTION].find_one(scoped(user, {"_id": cache_key}))


async def upsert_cache_doc(user: Optional[dict], cache_key: str, payload: Dict[str, Any]) -> None:
    await db[CACHE_COLLECTION].update_one(
        scoped(user, {"_id": cache_key}),
        {"$set": with_tenant_id({**payload, "_id": cache_key}, user)},
        upsert=True,
    )


async def clear_cache_docs(user: Optional[dict]) -> int:
    result = await db[CACHE_COLLECTION].delete_many(scoped(user, {}))
    return result.deleted_count


def find_custom_equipment_types(user: Optional[dict], query: Dict[str, Any], projection: dict):
    return db.custom_equipment_types.find(scoped(user, query), projection)


def find_failure_modes(user: Optional[dict], query: Dict[str, Any], projection: dict):
    return db.failure_modes.find(scoped(user, query), projection)
