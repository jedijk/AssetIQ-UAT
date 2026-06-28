"""Domain event outbox processor — worker-layer event dispatch."""
from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional

from services.event_outbox import claim_next_event, process_event

logger = logging.getLogger("assetiq.workers.events")


def build_event_handlers() -> Dict[str, Callable[..., Any]]:
    from workers.graph_projection_handler import graph_event_handlers
    from workers.lifecycle_graph_handler import lifecycle_graph_event_handlers
    from workers.projection_handler import projection_event_handlers

    handlers = {}
    handlers.update(graph_event_handlers())
    handlers.update(lifecycle_graph_event_handlers())
    handlers.update(projection_event_handlers())
    return handlers


async def process_one_outbox_event(
    event_types: Optional[list] = None,
) -> bool:
    """Claim and process a single outbox event. Returns True if work was done."""
    event = await claim_next_event(event_types)
    if not event:
        return False

    handlers = build_event_handlers()
    await process_event(event, handlers)
    return True


async def process_outbox_batch(limit: int = 10) -> int:
    """Process up to ``limit`` pending outbox events."""
    processed = 0
    for _ in range(limit):
        if not await process_one_outbox_event():
            break
        processed += 1
    return processed
