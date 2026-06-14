"""Maintenance program and scheduled task persistence — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class MaintenanceProgramRepository(TenantScopedRepository):
    collection_name = "maintenance_programs_v2"


class ScheduledTaskRepository(TenantScopedRepository):
    collection_name = "scheduled_tasks"

    async def list_for_program(
        self,
        program_id: str,
        *,
        user: Optional[dict] = None,
        limit: int = 200,
    ) -> List[dict]:
        return await self.find_many(
            {"program_id": program_id},
            user=user,
            limit=limit,
        )
