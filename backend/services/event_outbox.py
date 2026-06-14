"""
Transactional Outbox for domain events — Wave 3 event architecture foundation.

Events are written atomically with business operations (same request) and processed
asynchronously by projection workers. Failed events retry with dead-letter tracking.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from database import db
from services.tenant_schema import with_tenant_id

logger = logging.getLogger("assetiq.events")

COLLECTION = "domain_event_outbox"
MAX_ATTEMPTS = int(os.environ.get("EVENT_OUTBOX_MAX_ATTEMPTS", "5"))


class OutboxStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


async def publish_event(
    *,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: Optional[Dict[str, Any]] = None,
    user: Optional[dict] = None,
    tenant_id: Optional[str] = None,
) -> str:
    """Persist a domain event for async processing. Returns event id."""
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc: Dict[str, Any] = {
        "id": event_id,
        "event_type": event_type,
        "aggregate_type": aggregate_type,
        "aggregate_id": aggregate_id,
        "payload": payload or {},
        "status": OutboxStatus.PENDING.value,
        "attempts": 0,
        "created_at": now,
        "updated_at": now,
        "processed_at": None,
        "error": None,
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    else:
        with_tenant_id(doc, user)

    await db[COLLECTION].insert_one(doc)
    logger.info(
        "event published",
        extra={
            "event_id": event_id,
            "event_type": event_type,
            "aggregate_id": aggregate_id,
        },
    )
    return event_id


async def claim_next_event(
    event_types: Optional[List[str]] = None,
) -> Optional[dict]:
    """Atomically claim the oldest pending outbox event."""
    filt: Dict[str, Any] = {"status": OutboxStatus.PENDING.value}
    if event_types:
        filt["event_type"] = {"$in": event_types}

    now = datetime.now(timezone.utc).isoformat()
    return await db[COLLECTION].find_one_and_update(
        filt,
        {
            "$set": {
                "status": OutboxStatus.PROCESSING.value,
                "updated_at": now,
            },
            "$inc": {"attempts": 1},
        },
        sort=[("created_at", 1)],
        return_document=True,
    )


async def mark_completed(event_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db[COLLECTION].update_one(
        {"id": event_id},
        {
            "$set": {
                "status": OutboxStatus.COMPLETED.value,
                "processed_at": now,
                "updated_at": now,
                "error": None,
            }
        },
    )


async def mark_failed(event_id: str, error: str, *, attempts: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    status = (
        OutboxStatus.DEAD_LETTER.value
        if attempts >= MAX_ATTEMPTS
        else OutboxStatus.PENDING.value
    )
    await db[COLLECTION].update_one(
        {"id": event_id},
        {
            "$set": {
                "status": status,
                "updated_at": now,
                "error": error[:2000],
            }
        },
    )
    if status == OutboxStatus.DEAD_LETTER.value:
        logger.error(
            "event dead letter",
            extra={"event_id": event_id, "error": error[:500]},
        )


async def process_event(
    event: dict,
    handlers: Dict[str, Callable[..., Any]],
) -> None:
    """Dispatch one outbox event to its registered handler."""
    event_id = event.get("id")
    event_type = event.get("event_type")
    handler = handlers.get(event_type)
    if not handler:
        await mark_failed(
            event_id,
            f"No handler for event_type={event_type}",
            attempts=event.get("attempts", 1),
        )
        return

    try:
        await handler(event)
        await mark_completed(event_id)
    except Exception as exc:
        logger.warning(
            "event handler failed",
            extra={"event_id": event_id, "event_type": event_type, "error": str(exc)[:500]},
        )
        await mark_failed(event_id, str(exc), attempts=event.get("attempts", 1))


async def get_outbox_health() -> Dict[str, Any]:
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    rows = await db[COLLECTION].aggregate(pipeline).to_list(20)
    by_status = {r["_id"]: r["count"] for r in rows}
    return {"collection": COLLECTION, "by_status": by_status}
