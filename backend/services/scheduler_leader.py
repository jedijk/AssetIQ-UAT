"""
Mongo-backed leader election for the weekly task-generation cron.

Only one API replica should execute ``weekly_task_generation`` at fire time.
Set ``DISABLE_API_SCHEDULER=true`` to skip scheduler startup entirely (e.g. worker-only cron).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from database import db

logger = logging.getLogger(__name__)

LOCK_COLLECTION = "scheduler_leader_lock"
LOCK_ID = "weekly_task_generation"
TTL_SECONDS = int(os.getenv("SCHEDULER_LEADER_TTL_SECONDS", "120"))


def api_scheduler_enabled() -> bool:
    """Whether this process should register the APScheduler job."""
    if os.getenv("DISABLE_API_SCHEDULER", "").lower() in ("1", "true", "yes"):
        return False
    return True


def _holder_id() -> str:
    return (
        os.getenv("HOSTNAME")
        or os.getenv("RAILWAY_REPLICA_ID")
        or os.getenv("DYNO")
        or "local"
    )


async def try_acquire_scheduler_leadership() -> bool:
    """Return True when this replica holds the scheduler leader lock."""
    if not api_scheduler_enabled():
        return False

    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=TTL_SECONDS)
    holder = _holder_id()

    try:
        doc = await db[LOCK_COLLECTION].find_one_and_update(
            {
                "_id": LOCK_ID,
                "$or": [
                    {"expires_at": {"$lt": now}},
                    {"holder": holder},
                ],
            },
            {
                "$set": {
                    "holder": holder,
                    "expires_at": expires,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
            return_document=True,
        )
        acquired = doc is not None and doc.get("holder") == holder
        if not acquired:
            logger.debug(
                "scheduler leadership held by %s until %s",
                (doc or {}).get("holder"),
                (doc or {}).get("expires_at"),
            )
        return acquired
    except Exception as exc:
        logger.warning("scheduler leader lock failed — skipping run: %s", exc)
        return False
