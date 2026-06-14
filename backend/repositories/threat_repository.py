"""Threat persistence — tenant-scoped cascade deletes."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from database import db
from repositories.base import TenantScopedRepository
from repositories.cascade_helpers import (
    delete_actions_for_threat,
    delete_investigations_for_threat,
    session_kw,
)
from services.db_transactions import run_transactional
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)


class ThreatRepository(TenantScopedRepository):
    collection_name = "threats"

    async def find_by_id(self, threat_id: str, *, user: Optional[dict] = None):
        return await self.find_one({"id": threat_id}, user=user)

    def delete_filter(self, threat_id: str, user: dict) -> Dict[str, Any]:
        base = {"id": threat_id}
        if user.get("role") not in ("owner", "admin"):
            base["created_by"] = user.get("id")
        return self.scoped_filter(base, user)


async def delete_threat_cascade(
    *,
    threat_id: str,
    delete_actions: bool = False,
    delete_investigations: bool = False,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Delete a threat with optional linked actions/investigations (transactional)."""
    if not user:
        raise ValueError("user_required")

    repo = ThreatRepository(db)
    threat = await repo.find_by_id(threat_id, user=user)
    if not threat:
        raise ValueError("not_found")

    deleted_actions_count = 0
    deleted_investigations_count = 0
    threat_delete_filter = repo.delete_filter(threat_id, user)

    async def _cascade(session) -> Dict[str, Any]:
        nonlocal deleted_actions_count, deleted_investigations_count
        skw = session_kw(session)

        if delete_actions:
            deleted_actions_count += await delete_actions_for_threat(
                threat_id, user=user, session=session
            )

        if delete_investigations:
            inv_count, extra_actions = await delete_investigations_for_threat(
                threat_id,
                user=user,
                session=session,
                delete_actions=delete_actions,
            )
            deleted_investigations_count = inv_count
            deleted_actions_count += extra_actions

        result = await db.threats.delete_one(threat_delete_filter, **skw)
        if result.deleted_count == 0:
            raise ValueError("forbidden")

        return {
            "threat_id": threat_id,
            "deleted_actions": deleted_actions_count,
            "deleted_investigations": deleted_investigations_count,
        }

    return await run_transactional(_cascade, operation="threat_cascade_delete")
