"""Projection refresh handler — processes read-model events from the outbox."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger("assetiq.workers.projection")


def _user_from_event(event: dict, payload: dict) -> dict | None:
    user = payload.get("user")
    if user:
        return user
    if event.get("tenant_id"):
        return {
            "id": payload.get("user_id") or "outbox-system",
            "role": "owner",
            "company_id": event.get("tenant_id"),
        }
    return None


async def handle_projection_outbox_event(event: dict) -> None:
    event_type = event.get("event_type")
    payload = event.get("payload") or {}
    user = _user_from_event(event, payload)

    if event_type == "projection.executive_kpi":
        if user:
            from services.executive_kpi_materializer import refresh_executive_kpis

            await refresh_executive_kpis(user)
        return

    if event_type == "projection.executive_dashboard":
        if user:
            from services.executive_dashboard_materializer import refresh_executive_dashboard

            period_days = int(payload.get("period_days") or 30)
            await refresh_executive_dashboard(user, period_days)
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

    if event_type == "projection.ril_dashboard":
        if user:
            from services.ril_dashboard_materializer import refresh_ril_dashboard

            await refresh_ril_dashboard(user)
        return

    if event_type == "projection.production_dashboard":
        if user:
            from services.production_dashboard_materializer import expire_production_dashboard_snapshots

            await expire_production_dashboard_snapshots(user)
        return

    if event_type == "projection.insights_summary":
        if user:
            from services.insights_summary_materializer import refresh_insights_summary

            await refresh_insights_summary(user)
        return

    if event_type == "projection.analytics_dashboard":
        if user:
            from services.analytics_dashboard_materializer import refresh_analytics_dashboard

            await refresh_analytics_dashboard(user)
        return

    logger.warning("unknown projection event type: %s", event_type)


def projection_event_handlers() -> Dict[str, Any]:
    from services.domain_events import PROJECTION_EVENT_TYPES

    return {event_type.value: handle_projection_outbox_event for event_type in PROJECTION_EVENT_TYPES}
