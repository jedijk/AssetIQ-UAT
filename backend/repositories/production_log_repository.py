"""Production log persistence — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class ProductionLogRepository(TenantScopedRepository):
    collection_name = "production_logs"

    async def list_for_equipment(
        self,
        equipment_id: str,
        *,
        user: Optional[dict] = None,
        limit: int = 100,
        skip: int = 0,
    ) -> List[dict]:
        return await self.find_many(
            {"equipment_id": equipment_id},
            user=user,
            sort=[("timestamp", -1)],
            skip=skip,
            limit=limit,
        )
