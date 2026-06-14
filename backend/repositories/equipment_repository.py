"""Equipment hierarchy persistence — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class EquipmentRepository(TenantScopedRepository):
    collection_name = "equipment_nodes"

    async def find_by_ids(
        self,
        equipment_ids: List[str],
        *,
        user: Optional[dict] = None,
        projection: Optional[Dict[str, Any]] = None,
        limit: int = 500,
    ) -> List[dict]:
        if not equipment_ids:
            return []
        return await self.find_many(
            {"id": {"$in": list(set(equipment_ids))}},
            user=user,
            projection=projection,
            limit=limit,
        )

    async def find_tags_by_ids(
        self,
        equipment_ids: List[str],
        *,
        user: Optional[dict] = None,
    ) -> Dict[str, Optional[str]]:
        nodes = await self.find_by_ids(
            equipment_ids,
            user=user,
            projection={"_id": 0, "id": 1, "tag": 1},
        )
        return {node["id"]: node.get("tag") for node in nodes if node.get("id")}
