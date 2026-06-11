"""Atomic allocation of unique central_actions.action_number values."""
from __future__ import annotations

from database import db

_COUNTER_ID = "central_actions"


async def allocate_central_action_number() -> str:
    """
    Return the next globally unique action number (e.g. ACT-0001).

    Uses a single MongoDB counter document so concurrent creates cannot
    reuse the same sequence value (unlike count_documents-based allocation).
    """
    existing_count = await db.central_actions.count_documents({})
    await db.action_counters.update_one(
        {"_id": _COUNTER_ID},
        {"$setOnInsert": {"seq": existing_count}},
        upsert=True,
    )
    counter = await db.action_counters.find_one_and_update(
        {"_id": _COUNTER_ID},
        {"$inc": {"seq": 1}},
        return_document=True,
    )
    seq = (counter or {}).get("seq", existing_count + 1)
    return f"ACT-{seq:04d}"
