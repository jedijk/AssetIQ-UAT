"""Work item and task instance persistence — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class WorkItemProjectionRepository(TenantScopedRepository):
    collection_name = "work_item_projections"


class TaskInstanceRepository(TenantScopedRepository):
    collection_name = "task_instances"

    async def find_by_ids_mixed(
        self,
        ids: List[str],
        *,
        user: Optional[dict] = None,
        projection: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> List[dict]:
        if not ids:
            return []
        return await self.find_many(
            {"id": {"$in": list(set(ids))}},
            user=user,
            projection=projection,
            limit=limit,
        )
