"""Observation persistence — cascade deletes isolated from route handlers."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId
from bson.errors import InvalidId

from database import db

logger = logging.getLogger(__name__)


async def find_observation_by_id(obs_id: str) -> Optional[dict]:
    """Resolve observation by Mongo ObjectId string or logical id field."""
    observation = None
    try:
        observation = await db.observations.find_one({"_id": ObjectId(obs_id)})
    except (TypeError, ValueError, InvalidId):
        pass
    if not observation:
        observation = await db.observations.find_one({"id": obs_id})
    return observation


async def delete_observation_cascade(
    *,
    obs_id: str,
    delete_actions: bool = False,
    delete_investigations: bool = False,
) -> Dict[str, Any]:
    """
    Delete an observation and optionally linked actions/investigations.
    Returns counts and raises ValueError when not found or delete fails.
    """
    observation = await find_observation_by_id(obs_id)
    if not observation:
        raise ValueError("not_found")

    observation_id = observation.get("id") or str(observation.get("_id"))
    deleted_actions_count = 0
    deleted_investigations_count = 0

    if delete_actions:
        result = await db.central_actions.delete_many({
            "source_type": "threat",
            "source_id": observation_id,
        })
        deleted_actions_count += result.deleted_count
        logger.info(
            "Deleted %s central actions linked to observation %s",
            result.deleted_count,
            observation_id,
        )

    if delete_investigations:
        linked_investigations = await db.investigations.find(
            {"threat_id": observation_id}
        ).to_list(100)

        for inv in linked_investigations:
            inv_id = inv.get("id")
            await db.timeline_events.delete_many({"investigation_id": inv_id})
            await db.failure_identifications.delete_many({"investigation_id": inv_id})
            await db.cause_nodes.delete_many({"investigation_id": inv_id})
            await db.action_items.delete_many({"investigation_id": inv_id})
            await db.evidence_items.delete_many({"investigation_id": inv_id})

            if delete_actions:
                result = await db.central_actions.delete_many({
                    "source_type": "investigation",
                    "source_id": inv_id,
                })
                deleted_actions_count += result.deleted_count

        result = await db.investigations.delete_many({"threat_id": observation_id})
        deleted_investigations_count = result.deleted_count
        logger.info(
            "Deleted %s investigations linked to observation %s",
            deleted_investigations_count,
            observation_id,
        )

    try:
        result = await db.observations.delete_one({"_id": observation["_id"]})
    except (TypeError, KeyError):
        result = await db.observations.delete_one({"id": obs_id})

    if result.deleted_count == 0:
        raise ValueError("delete_failed")

    return {
        "observation_id": observation_id,
        "deleted_actions": deleted_actions_count,
        "deleted_investigations": deleted_investigations_count,
    }
