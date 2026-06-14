"""Observation persistence — tenant-scoped cascade deletes isolated from route handlers."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from bson import ObjectId
from bson.errors import InvalidId

from database import db
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


def _session_kw(session) -> Dict[str, Any]:
    return {"session": session} if session is not None else {}


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
        skw = _session_kw(session)

        if delete_actions:
            action_filter = merge_tenant_filter(
                {
                    "source_type": "threat",
                    "source_id": observation_id,
                },
                user,
            )
            result = await db.central_actions.delete_many(action_filter, **skw)
            deleted_actions_count += result.deleted_count
            logger.info(
                "Deleted %s central actions linked to observation %s",
                result.deleted_count,
                observation_id,
            )

        if delete_investigations:
            inv_filter = merge_tenant_filter({"threat_id": observation_id}, user)
            linked_investigations = await db.investigations.find(
                inv_filter,
                {"id": 1},
            ).to_list(100)

            for inv in linked_investigations:
                inv_id = inv.get("id")
                inv_scope = {"investigation_id": inv_id}
                await db.timeline_events.delete_many(
                    merge_tenant_filter(inv_scope, user),
                    **skw,
                )
                await db.failure_identifications.delete_many(
                    merge_tenant_filter(inv_scope, user),
                    **skw,
                )
                await db.cause_nodes.delete_many(
                    merge_tenant_filter(inv_scope, user),
                    **skw,
                )
                await db.action_items.delete_many(
                    merge_tenant_filter(inv_scope, user),
                    **skw,
                )
                await db.evidence_items.delete_many(
                    merge_tenant_filter(inv_scope, user),
                    **skw,
                )

                if delete_actions:
                    result = await db.central_actions.delete_many(
                        merge_tenant_filter(
                            {
                                "source_type": "investigation",
                                "source_id": inv_id,
                            },
                            user,
                        ),
                        **skw,
                    )
                    deleted_actions_count += result.deleted_count

            result = await db.investigations.delete_many(inv_filter, **skw)
            deleted_investigations_count = result.deleted_count
            logger.info(
                "Deleted %s investigations linked to observation %s",
                deleted_investigations_count,
                observation_id,
            )

        result = await db.observations.delete_one(obs_delete_filter, **skw)
        if result.deleted_count == 0:
            raise ValueError("delete_failed")

        return {
            "observation_id": observation_id,
            "deleted_actions": deleted_actions_count,
            "deleted_investigations": deleted_investigations_count,
        }

    return await run_transactional(_cascade, operation="observation_cascade_delete")
