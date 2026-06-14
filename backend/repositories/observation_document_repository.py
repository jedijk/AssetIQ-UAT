"""Observation document repository — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class ObservationRepository(TenantScopedRepository):
    collection_name = "observations"

    async def find_observation_by_id(self, obs_id: str, *, user: Optional[dict] = None):
        return await self.find_by_id(obs_id, user=user)

    async def fetch_one(self, query: Dict[str, Any], *, user: Optional[dict] = None) -> Optional[dict]:
        """Full document read (includes _id) for serialization."""
        return await self.collection.find_one(self.scoped_filter(query, user))

    async def fetch_many(
        self,
        query: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        sort=None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[dict]:
        cursor = self.collection.find(self.scoped_filter(query, user))
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.skip(skip).limit(limit).to_list(limit)

    async def aggregate_scoped(
        self,
        pipeline: List[Dict[str, Any]],
        *,
        user: Optional[dict] = None,
        limit: Optional[int] = None,
    ) -> List[dict]:
        """Run aggregation with tenant scope (pipeline may include its own $match)."""
        return await self.aggregate(pipeline, user=user, limit=limit)
