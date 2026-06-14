"""User persistence — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class UserRepository(TenantScopedRepository):
    collection_name = "users"

    async def find_by_ids(
        self,
        user_ids: List[str],
        *,
        user: Optional[dict] = None,
        projection: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> List[dict]:
        if not user_ids:
            return []
        return await self.find_many(
            {"id": {"$in": list(set(user_ids))}},
            user=user,
            projection=projection,
            limit=limit,
        )
