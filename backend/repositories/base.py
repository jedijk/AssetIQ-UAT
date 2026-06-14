"""
Base repository — standard data access conventions for Wave 3.

Route → Service → Repository → MongoDB
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from services.tenant_schema import merge_tenant_filter, with_tenant_id


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
