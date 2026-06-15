"""Investigation persistence — tenant-scoped repository and cascade deletes."""
from __future__ import annotations

from typing import Any, Dict, Optional

from database import db
from repositories.base import TenantScopedRepository
from repositories.cascade_helpers import delete_single_investigation_cascade
from services.db_transactions import run_transactional


class InvestigationRepository(TenantScopedRepository):
    collection_name = "investigations"

    async def find_by_id(self, investigation_id: str, *, user: Optional[dict] = None):
        return await self.find_one({"id": investigation_id}, user=user)

    async def find_by_threat(self, threat_id: str, *, user: Optional[dict] = None, limit: int = 100):
        return await self.find_many({"threat_id": threat_id}, user=user, limit=limit)


async def delete_investigation_cascade(
    *,
    inv_id: str,
    delete_central_actions: bool = False,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Delete an investigation and related sub-documents (transactional)."""
    if not user:
        raise ValueError("user_required")

    repo = InvestigationRepository(db)
    inv = await repo.find_by_id(inv_id, user=user)
    if not inv:
        raise ValueError("not_found")

    async def _cascade(session) -> Dict[str, Any]:
        deleted_actions = await delete_single_investigation_cascade(
            inv_id,
            user=user,
            session=session,
            delete_central_actions=delete_central_actions,
        )
        return {
            "investigation_id": inv_id,
            "deleted_central_actions": deleted_actions,
        }

    return await run_transactional(_cascade, operation="investigation_cascade_delete")
