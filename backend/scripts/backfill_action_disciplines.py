"""
One-shot migration to backfill `discipline` on existing central_actions that
were created BEFORE the discipline pass-through fix in add-recommendation.

Strategy (in order of preference):
1. If action.recommendation_id matches the `fm-<failure_mode_id>-<idx>` pattern
   the original `get_recommended_actions` produces, look up the failure mode and
   pull the discipline from `recommended_actions[idx]`.
2. Else, if action.failure_mode_id is set, look up the failure mode and find an
   `recommended_actions` entry whose `action` text matches the action's title;
   copy that entry's discipline.
3. Else, leave it blank.

Safe to run repeatedly — only touches actions where `discipline` is missing/empty.
"""

import logging
import re

logger = logging.getLogger(__name__)

REC_ID_RE = re.compile(r"^fm-(?P<fm>.+)-(?P<idx>\d+)$")


async def _discipline_from_recommendation_id(db, recommendation_id: str) -> str | None:
    m = REC_ID_RE.match(recommendation_id or "")
    if not m:
        return None
    fm_id = m.group("fm")
    try:
        idx = int(m.group("idx"))
    except ValueError:
        return None
    fm = await db.failure_modes.find_one({"id": fm_id}, {"_id": 0, "recommended_actions": 1})
    if not fm:
        return None
    actions = fm.get("recommended_actions") or []
    if 0 <= idx < len(actions):
        entry = actions[idx]
        if isinstance(entry, dict):
            return entry.get("discipline")
    return None


async def _discipline_by_title_match(db, fm_id: str, title: str) -> str | None:
    if not fm_id or not title:
        return None
    fm = await db.failure_modes.find_one({"id": fm_id}, {"_id": 0, "recommended_actions": 1})
    if not fm:
        return None
    title_lc = title.strip().lower()
    for entry in fm.get("recommended_actions") or []:
        if not isinstance(entry, dict):
            continue
        candidate = (entry.get("action") or entry.get("title") or "").strip().lower()
        if candidate and (candidate == title_lc or candidate in title_lc or title_lc in candidate):
            return entry.get("discipline")
    return None


async def backfill_action_disciplines(db) -> dict:
    stats = {"scanned": 0, "updated": 0, "skipped": 0}

    cursor = db.central_actions.find(
        {"$or": [{"discipline": {"$exists": False}}, {"discipline": None}, {"discipline": ""}]},
        {"_id": 0, "id": 1, "title": 1, "recommendation_id": 1, "failure_mode_id": 1}
    )

    async for action in cursor:
        stats["scanned"] += 1
        discipline = await _discipline_from_recommendation_id(db, action.get("recommendation_id"))
        if not discipline:
            discipline = await _discipline_by_title_match(db, action.get("failure_mode_id"), action.get("title", ""))

        if discipline:
            await db.central_actions.update_one(
                {"id": action["id"]},
                {"$set": {"discipline": discipline}}
            )
            stats["updated"] += 1
        else:
            stats["skipped"] += 1

    logger.info(f"Action discipline backfill: {stats}")
    return stats
