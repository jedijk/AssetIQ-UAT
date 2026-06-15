"""
Base repository — standard data access conventions for Wave 3.

Route → Service → Repository → MongoDB
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from bson import ObjectId
from bson.errors import InvalidId

from services.tenant_schema import merge_tenant_filter, with_tenant_id


def flexible_id_query(doc_id: str, field: str = "id") -> Dict[str, Any]:
    """Build a query matching string id and/or ObjectId."""
    clauses: List[Dict[str, Any]] = [{field: doc_id}]
    try:
        clauses.append({"_id": ObjectId(doc_id)})
    except (TypeError, ValueError, InvalidId):
        pass
    if len(clauses) == 1:
        return clauses[0]
    return {"$or": clauses}


class TenantScopedRepository:
    """Base class for tenant-scoped MongoDB repositories."""

    collection_name: str = ""

    def __init__(self, db):
        self._db = db

    @property
    def collection(self):
        return self._db[self.collection_name]

    def scoped_filter(self, base: Dict[str, Any], user: Optional[dict]) -> Dict[str, Any]:
        return merge_tenant_filter(base, user)

    def with_tenant(self, doc: Dict[str, Any], user: Optional[dict]) -> Dict[str, Any]:
        return with_tenant_id(doc, user)

    async def find_one(
        self,
        query: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        projection: Optional[Dict[str, Any]] = None,
    ) -> Optional[dict]:
        return await self.collection.find_one(
            self.scoped_filter(query, user),
            projection or {"_id": 0},
        )

    async def find_many(
        self,
        query: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        projection: Optional[Dict[str, Any]] = None,
        sort=None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[dict]:
        cursor = self.collection.find(
            self.scoped_filter(query, user),
            projection or {"_id": 0},
        )
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.skip(skip).limit(limit).to_list(limit)

    async def count(self, query: Dict[str, Any], *, user: Optional[dict] = None) -> int:
        return await self.collection.count_documents(self.scoped_filter(query, user))

    async def insert_one(self, doc: Dict[str, Any], *, user: Optional[dict] = None):
        payload = self.with_tenant(dict(doc), user)
        return await self.collection.insert_one(payload)

    async def update_one(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        *,
        user: Optional[dict] = None,
    ):
        return await self.collection.update_one(
            self.scoped_filter(query, user),
            update,
        )

    async def delete_one(self, query: Dict[str, Any], *, user: Optional[dict] = None):
        return await self.collection.delete_one(self.scoped_filter(query, user))

    async def delete_many(self, query: Dict[str, Any], *, user: Optional[dict] = None):
        return await self.collection.delete_many(self.scoped_filter(query, user))

    async def find_by_id(
        self,
        doc_id: str,
        *,
        user: Optional[dict] = None,
        projection: Optional[Dict[str, Any]] = None,
        id_field: str = "id",
    ) -> Optional[dict]:
        return await self.find_one(
            flexible_id_query(doc_id, id_field),
            user=user,
            projection=projection,
        )

    async def aggregate(
        self,
        pipeline: List[Dict[str, Any]],
        *,
        user: Optional[dict] = None,
        limit: Optional[int] = None,
    ) -> List[dict]:
        match = self.scoped_filter({}, user)
        if match:
            pipeline = [{"$match": match}] + list(pipeline)
        cursor = self.collection.aggregate(pipeline)
        if limit is not None:
            return await cursor.to_list(limit)
        return await cursor.to_list(length=limit or 100)

    async def update_by_id(
        self,
        doc_id: str,
        update: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        id_field: str = "id",
    ):
        doc = await self.find_by_id(doc_id, user=user, projection={"_id": 1, id_field: 1})
        if not doc:
            return None
        filt = {"_id": doc["_id"]}
        return await self.collection.update_one(filt, update)

    async def find_one_and_update(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        return_document: bool = True,
        projection: Optional[Dict[str, Any]] = None,
    ):
        from pymongo import ReturnDocument

        return await self.collection.find_one_and_update(
            self.scoped_filter(query, user),
            update,
            return_document=ReturnDocument.AFTER if return_document else ReturnDocument.BEFORE,
            projection=projection,
        )

    async def insert_document(self, doc: Dict[str, Any], *, user: Optional[dict] = None) -> dict:
        payload = self.with_tenant(dict(doc), user)
        result = await self.collection.insert_one(payload)
        payload["_id"] = result.inserted_id
        return payload

    async def distinct(self, field: str, query: Dict[str, Any], *, user: Optional[dict] = None) -> List:
        return await self.collection.distinct(field, self.scoped_filter(query, user))
