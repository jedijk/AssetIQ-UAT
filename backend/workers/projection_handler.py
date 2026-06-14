"""Projection refresh handler — processes read-model events from the outbox."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger("assetiq.workers.projection")


async def handle_projection_outbox_event(event: dict) -> None:
    event_type = event.get("event_type")
    payload = event.get("payload") or {}
    user = payload.get("user")
    if not user and event.get("tenant_id"):
        user = {
            "id": payload.get("user_id") or "outbox-system",
            "role": "owner",
            "company_id": event.get("tenant_id"),
        }

    if event_type == "projection.executive_kpi":
        if user:
            from services.executive_kpi_materializer import refresh_executive_kpis

            await refresh_executive_kpis(user)
        return

    if event_type == "projection.work_execution_kpi":
        if user:
            from services.work_execution_kpi_materializer import refresh_work_execution_kpis

            await refresh_work_execution_kpis(user)
        return

    if event_type == "projection.asset_health":
        from services.asset_health_materializer import refresh_asset_health_documents

        equipment_ids = payload.get("equipment_ids")
        await refresh_asset_health_documents(equipment_ids=equipment_ids)
        return

    logger.warning("unknown projection event type: %s", event_type)


def projection_event_handlers() -> Dict[str, Any]:
    from services.domain_events import PROJECTION_EVENT_TYPES

    return {event_type.value: handle_projection_outbox_event for event_type in PROJECTION_EVENT_TYPES}
