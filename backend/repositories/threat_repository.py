"""Threat persistence — tenant-scoped repository (Wave 3 standardization)."""
from __future__ import annotations

from typing import Optional

from repositories.base import TenantScopedRepository


class ThreatRepository(TenantScopedRepository):
    collection_name = "threats"

    async def find_by_id(self, threat_id: str, *, user: Optional[dict] = None):
        return await self.find_one({"id": threat_id}, user=user)
