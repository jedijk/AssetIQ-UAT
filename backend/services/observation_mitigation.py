"""
Auto-mitigate observations when every action on the action plan is complete.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

DONE_ACTION_STATUSES = {"completed", "validated"}
TERMINAL_OBSERVATION_STATUSES = {"mitigated", "learning", "closed"}


def observation_action_filter(observation_id: str) -> dict:
    """Match central actions shown on the observation workspace action plan."""
    return {
        "$or": [
            {"source_id": observation_id},
            {"observation_id": observation_id},
            {"threat_id": observation_id},
        ]
    }


def is_action_plan_item_done(status: Optional[str]) -> bool:
    return (status or "").lower() in DONE_ACTION_STATUSES


async def all_action_plan_actions_complete(observation_id: str) -> Tuple[bool, int]:
    from database import db

    actions = await db.central_actions.find(
        observation_action_filter(observation_id),
        {"_id": 0, "status": 1},
    ).to_list(500)
    if not actions:
        return False, 0
    return all(is_action_plan_item_done(a.get("status")) for a in actions), len(actions)


def resolve_observation_id_from_action(action: dict) -> Optional[str]:
    if action.get("source_type") == "threat" and action.get("source_id"):
        return action["source_id"]
    return action.get("threat_id") or action.get("observation_id")


async def maybe_auto_mitigate_observation(
    observation_id: str,
    *,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Set observation status to Mitigated when the action plan has at least one
    action and every action is completed or validated.
    """
    all_done, _total = await all_action_plan_actions_complete(observation_id)
    if not all_done:
        return None

    from database import db

    threat = await db.threats.find_one(
        {"id": observation_id},
        {"_id": 0, "id": 1, "status": 1, "title": 1},
    )
    if not threat:
        return None

    current_status = (threat.get("status") or "").strip()
    if current_status.lower() in TERMINAL_OBSERVATION_STATUSES:
        return None

    now = datetime.now(timezone.utc).isoformat()
    await db.threats.update_one(
        {"id": observation_id},
        {
            "$set": {
                "status": "Mitigated",
                "updated_at": now,
                "mitigated_at": now,
                "auto_mitigated": True,
            }
        },
    )

    if user_id:
        try:
            from services.cache_service import cache
            from services.threat_score_service import update_all_ranks

            await update_all_ranks(user_id, user={"id": user_id} if user_id else None)
            cache.invalidate_stats(f"stats:{user_id}")
        except Exception as exc:
            logger.warning("Rank/stats refresh after auto-mitigate failed: %s", exc)

    logger.info("Auto-mitigated observation %s (was %s)", observation_id, current_status)
    return {
        "observation_id": observation_id,
        "previous_status": current_status,
        "status": "Mitigated",
        "title": threat.get("title"),
    }


async def build_action_plan_completion_notification(
    action: dict,
    *,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    When the last action on an observation plan completes, auto-mitigate and
    return a completion notification for the client.
    """
    observation_id = resolve_observation_id_from_action(action)
    if not observation_id:
        return None

    all_done, total_actions = await all_action_plan_actions_complete(observation_id)
    if not all_done or total_actions == 0:
        return None

    from database import db

    threat = await db.threats.find_one(
        {"id": observation_id},
        {"_id": 0, "title": 1, "status": 1},
    )
    if not threat:
        return None

    source_name = threat.get("title") or "Observation"
    source_status = threat.get("status") or ""
    if source_status.lower() in TERMINAL_OBSERVATION_STATUSES:
        return None

    mitigated = await maybe_auto_mitigate_observation(observation_id, user_id=user_id)
    if not mitigated:
        return None

    return {
        "type": "all_actions_completed",
        "source_type": "threat",
        "source_id": observation_id,
        "source_name": source_name,
        "total_actions": total_actions,
        "auto_mitigated": True,
        "suggest_closure": False,
        "message": (
            f"All {total_actions} action(s) for '{source_name}' are complete. "
            "Observation moved to Mitigated."
        ),
    }
