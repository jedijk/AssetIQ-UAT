"""Graph projection handler — processes reliability graph events from the outbox."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger("assetiq.workers.graph")


async def handle_graph_outbox_event(event: dict) -> None:
    """Execute a deferred graph sync from outbox payload."""
    payload = event.get("payload") or {}
    sync_name = payload.get("sync_name")
    kwargs = payload.get("kwargs") or {}
    label = payload.get("label", sync_name)

    if not sync_name:
        raise ValueError("graph event missing sync_name")

    from services.reliability_graph import GRAPH_SYNC_HANDLERS, _run_graph_sync

    handler = GRAPH_SYNC_HANDLERS.get(sync_name)
    if not handler:
        raise ValueError(f"unknown graph sync: {sync_name}")

    if sync_name == "sync_edges_for_scheduled_task":
        task_doc = kwargs.get("scheduled_task") or kwargs.get("task_doc")
        event_name = kwargs.get("event", "created")
        await _run_graph_sync(
            handler(task_doc, event=event_name),
            label,
        )
        return

    await _run_graph_sync(handler(**kwargs), label)


def graph_event_handlers() -> Dict[str, Any]:
    from services.domain_events import GRAPH_EVENT_TYPES

    return {event_type.value: handle_graph_outbox_event for event_type in GRAPH_EVENT_TYPES}
