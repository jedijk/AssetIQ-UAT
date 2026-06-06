"""
Work execution source configuration — bridge vs task_instances hybrid reads.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from database import db

WorkItemsSourceMode = Literal["v2_instances", "hybrid"]

_RECENT_BRIDGE_HOURS = int(os.getenv("WORK_ITEMS_BRIDGE_RECENT_HOURS", "24"))


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in ("1", "true", "yes")


def is_bridge_enabled() -> bool:
    """Task instance bridge is on unless explicitly disabled."""
    return _env_flag("TASK_INSTANCE_BRIDGE_ENABLED", "true")


def work_items_source_mode() -> WorkItemsSourceMode:
    """Return work-items read mode (hybrid merges unbridged scheduled_tasks)."""
    mode = (os.getenv("WORK_ITEMS_SOURCE") or "hybrid").strip().lower()
    if mode == "v2_instances":
        return "v2_instances"
    return "hybrid"


async def bridge_synced_recent_window(hours: Optional[int] = None) -> bool:
    """True when the bridge completed a non-dry-run within the recent window."""
    window = hours if hours is not None else _RECENT_BRIDGE_HOURS
    cutoff = datetime.now(timezone.utc) - timedelta(hours=window)
    run = await db.task_generation_runs.find_one(
        {
            "dry_run": False,
            "completed_at": {"$gte": cutoff},
        },
        sort=[("completed_at", -1)],
        projection={"_id": 1},
    )
    return run is not None


async def should_include_unbridged_work_items() -> bool:
    """
    Whether My Tasks should merge unbridged scheduled_tasks.

    WORK_ITEMS_INCLUDE_UNBRIDGED:
      - true: always include (when source mode is hybrid)
      - false: never include
      - auto (default): include only when bridge is disabled or has not synced recently
    """
    if work_items_source_mode() == "v2_instances":
        return False

    raw = (os.getenv("WORK_ITEMS_INCLUDE_UNBRIDGED") or "true").strip().lower()
    if raw in ("0", "false", "no"):
        return False
    if raw in ("1", "true", "yes"):
        return True
    if raw == "auto":
        if not is_bridge_enabled():
            return True
        synced = await bridge_synced_recent_window()
        return not synced

    return True
