"""
Canonical equipment type lookups.

The Strategy Library stores types in ``custom_equipment_types``. Legacy deployments
may still have rows in ``equipment_types`` — reads prefer custom, then fall back.
"""
from typing import Any, Dict, List, Optional, Set

from motor.motor_asyncio import AsyncIOMotorDatabase


async def count_equipment_types(db: AsyncIOMotorDatabase, query: Optional[Dict[str, Any]] = None) -> int:
    query = query or {}
    custom_count = await db.custom_equipment_types.count_documents(query)
    if custom_count:
        return custom_count
    return await db.equipment_types.count_documents(query)


async def list_equipment_types(
    db: AsyncIOMotorDatabase,
    query: Optional[Dict[str, Any]] = None,
    projection: Optional[Dict[str, int]] = None,
    limit: int = 500,
) -> List[dict]:
    query = query or {}
    projection = projection or {"_id": 0}
    custom = await db.custom_equipment_types.find(query, projection).to_list(limit)
    if custom:
        return custom
    return await db.equipment_types.find(query, projection).to_list(limit)


async def equipment_type_id_set(db: AsyncIOMotorDatabase) -> Set[str]:
    ids: Set[str] = set()
    async for doc in db.custom_equipment_types.find({}, {"id": 1, "_id": 0}):
        if doc.get("id"):
            ids.add(doc["id"])
    if ids:
        return ids
    async for doc in db.equipment_types.find({}, {"id": 1, "_id": 0}):
        if doc.get("id"):
            ids.add(doc["id"])
    return ids
