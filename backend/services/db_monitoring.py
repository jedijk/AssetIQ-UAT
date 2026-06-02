"""
MongoDB slow-query logging wrapper.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Callable

logger = logging.getLogger("assetiq.db")

SLOW_QUERY_MS = int(__import__("os").environ.get("SLOW_QUERY_MS", "500"))


async def timed_find(collection: Any, *args: Any, **kwargs: Any):
    """Wrap collection.find with slow-query logging."""
    start = time.perf_counter()
    cursor = collection.find(*args, **kwargs)
    duration_ms = (time.perf_counter() - start) * 1000
    if duration_ms >= SLOW_QUERY_MS:
        logger.warning(
            "slow query find",
            extra={
                "db_event": "slow_query",
                "collection": getattr(collection, "name", str(collection)),
                "duration_ms": round(duration_ms, 2),
                "filter": str(args[0] if args else kwargs.get("filter"))[:200],
            },
        )
    return cursor


async def timed_aggregate(collection: Any, pipeline: list, **kwargs: Any):
    start = time.perf_counter()
    result = await collection.aggregate(pipeline, **kwargs).to_list(None)
    duration_ms = (time.perf_counter() - start) * 1000
    if duration_ms >= SLOW_QUERY_MS:
        logger.warning(
            "slow query aggregate",
            extra={
                "db_event": "slow_query",
                "collection": getattr(collection, "name", str(collection)),
                "duration_ms": round(duration_ms, 2),
                "pipeline_stages": len(pipeline),
            },
        )
    return result
