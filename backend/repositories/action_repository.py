"""Central action persistence — tenant-scoped repository."""
from __future__ import annotations

from typing import Any, Dict, Optional

from database import db
from repositories.base import TenantScopedRepository


class ActionRepository(TenantScopedRepository):
    collection_name = "central_actions"

    async def find_by_id(self, action_id: str, *, user: Optional[dict] = None):
        return await self.find_one({"id": action_id}, user=user)

    async def find_by_source(
        self,
        source_type: str,
        source_id: str,
        *,
        user: Optional[dict] = None,
        limit: int = 100,
    ):
        return await self.find_many(
            {"source_type": source_type, "source_id": source_id},
            user=user,
            limit=limit,
        )

    def delete_filter(self, action_id: str, user: dict) -> Dict[str, Any]:
        base: Dict[str, Any] = {"id": action_id}
        if user.get("role") not in ("owner", "admin"):
            base["created_by"] = user.get("id")
        return self.scoped_filter(base, user)

    async def delete_by_id(self, action_id: str, *, user: dict) -> bool:
        filt = self.delete_filter(action_id, user)
        result = await db.central_actions.delete_one(filt)
        return result.deleted_count > 0


async def delete_central_action(*, action_id: str, user: dict) -> None:
    """Delete a central action with tenant scope and role checks."""
    if not user:
        raise ValueError("user_required")

    repo = ActionRepository(db)
    action = await repo.find_by_id(action_id, user=user)
    if not action:
        raise ValueError("not_found")

    deleted = await repo.delete_by_id(action_id, user=user)
    if not deleted:
        raise ValueError("forbidden")
