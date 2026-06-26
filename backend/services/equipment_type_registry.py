"""
Canonical equipment type lookups.

The Strategy Library stores types in ``custom_equipment_types``. Legacy deployments
may still have rows in ``equipment_types`` — reads prefer custom, then fall back.
"""
from typing import Any, Dict, List, Optional, Set

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.tenant_scope import scoped, scoped_job


def _q(user: Optional[dict], query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return scoped(user, query) if user else scoped_job(query)


async def count_equipment_types(
    db: AsyncIOMotorDatabase,
    query: Optional[Dict[str, Any]] = None,
    user: Optional[dict] = None,
) -> int:
    query = query or {}
    custom_count = await db.custom_equipment_types.count_documents(_q(user, query))
    if custom_count:
        return custom_count
    return await db.equipment_types.count_documents(_q(user, query))


async def list_equipment_types(
    db: AsyncIOMotorDatabase,
    query: Optional[Dict[str, Any]] = None,
    projection: Optional[Dict[str, int]] = None,
    limit: int = 500,
    user: Optional[dict] = None,
) -> List[dict]:
    query = query or {}
    projection = projection or {"_id": 0}
    custom = await db.custom_equipment_types.find(_q(user, query), projection).to_list(limit)
    if custom:
        return custom
    return await db.equipment_types.find(_q(user, query), projection).to_list(limit)


async def equipment_type_id_set(
    db: AsyncIOMotorDatabase,
    user: Optional[dict] = None,
) -> Set[str]:
    ids: Set[str] = set()
    async for doc in db.custom_equipment_types.find(_q(user, {}), {"id": 1, "_id": 0}):
        if doc.get("id"):
            ids.add(doc["id"])
    if ids:
        return ids
    async for doc in db.equipment_types.find(_q(user, {}), {"id": 1, "_id": 0}):
        if doc.get("id"):
            ids.add(doc["id"])
    return ids
