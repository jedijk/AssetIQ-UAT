"""Observation persistence — tenant-scoped cascade deletes isolated from route handlers."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from bson import ObjectId
from bson.errors import InvalidId

from database import db
from repositories.cascade_helpers import (
    delete_actions_for_threat,
    delete_investigations_for_threat,
    session_kw,
)
from services.db_transactions import run_transactional
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)


def _observation_id_clauses(obs_id: str) -> list:
    clauses = []
    try:
        clauses.append({"_id": ObjectId(obs_id)})
    except (TypeError, ValueError, InvalidId):
        pass
    clauses.append({"id": obs_id})
    return clauses


async def find_observation_by_id(
    obs_id: str,
    user: Optional[dict] = None,
) -> Optional[dict]:
    """Resolve observation by Mongo ObjectId string or logical id field, tenant-scoped."""
    for clause in _observation_id_clauses(obs_id):
        observation = await db.observations.find_one(merge_tenant_filter(clause, user))
        if observation:
            return observation
    return None


async def delete_observation_cascade(
    *,
    obs_id: str,
    delete_actions: bool = False,
    delete_investigations: bool = False,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Delete an observation and optionally linked actions/investigations.
    Uses a MongoDB transaction when available; tenant filters apply to all deletes.
    """
    observation = await find_observation_by_id(obs_id, user)
    if not observation:
        raise ValueError("not_found")

    observation_id = observation.get("id") or str(observation.get("_id"))
    deleted_actions_count = 0
    deleted_investigations_count = 0
    obs_delete_filter = merge_tenant_filter({"_id": observation["_id"]}, user)

    async def _cascade(session) -> Dict[str, Any]:
        nonlocal deleted_actions_count, deleted_investigations_count

        if delete_actions:
            deleted_actions_count += await delete_actions_for_threat(
                observation_id, user=user, session=session
            )

        if delete_investigations:
            inv_count, extra_actions = await delete_investigations_for_threat(
                observation_id,
                user=user,
                session=session,
                delete_actions=delete_actions,
            )
            deleted_investigations_count = inv_count
            deleted_actions_count += extra_actions

        result = await db.observations.delete_one(obs_delete_filter, **session_kw(session))
        if result.deleted_count == 0:
            raise ValueError("delete_failed")

        return {
            "observation_id": observation_id,
            "deleted_actions": deleted_actions_count,
            "deleted_investigations": deleted_investigations_count,
        }

    return await run_transactional(_cascade, operation="observation_cascade_delete")
