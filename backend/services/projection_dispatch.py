"""
Read-model projection invalidation — Wave 3 projection convergence.

Dashboard refreshes enqueue via outbox instead of inline aggregation in routes.
"""
from __future__ import annotations

from typing import Optional

from services.domain_events import DomainEventType, PROJECTION_EVENT_TYPES
from services.event_outbox import publish_event
from services.tenant_schema import tenant_id_from_user


async def _publish_projection(
    event_type: str,
    aggregate_type: str,
    *,
    user: Optional[dict] = None,
    reason: str = "",
    extra: Optional[dict] = None,
) -> str:
    tid = tenant_id_from_user(user) or "system"
    payload = {"reason": reason, **(extra or {})}
    return await publish_event(
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=tid,
        payload=payload,
        user=user,
        tenant_id=tid,
    )


async def invalidate_executive_kpi(*, user: Optional[dict] = None, reason: str = "") -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_EXECUTIVE_KPI.value,
        "executive_kpi_snapshot",
        user=user,
        reason=reason,
    )


async def invalidate_executive_dashboard(
    *,
    user: Optional[dict] = None,
    reason: str = "",
    period_days: int = 30,
) -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_EXECUTIVE_DASHBOARD.value,
        "executive_dashboard_snapshot",
        user=user,
        reason=reason,
        extra={"period_days": period_days},
    )


async def invalidate_work_execution_kpi(*, user: Optional[dict] = None, reason: str = "") -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_WORK_EXECUTION_KPI.value,
        "work_execution_kpi_snapshot",
        user=user,
        reason=reason,
    )


async def invalidate_asset_health(*, user: Optional[dict] = None, reason: str = "") -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_ASSET_HEALTH.value,
        "asset_health_document",
        user=user,
        reason=reason,
    )


async def invalidate_ril_dashboard(*, user: Optional[dict] = None, reason: str = "") -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_RIL_DASHBOARD.value,
        "ril_dashboard_snapshot",
        user=user,
        reason=reason,
    )


async def invalidate_production_dashboard(
    *,
    user: Optional[dict] = None,
    reason: str = "",
    cache_key: str = "",
) -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_PRODUCTION_DASHBOARD.value,
        "production_dashboard_snapshot",
        user=user,
        reason=reason,
        extra={"cache_key": cache_key},
    )


async def invalidate_insights_summary(*, user: Optional[dict] = None, reason: str = "") -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_INSIGHTS_SUMMARY.value,
        "insights_summary_snapshot",
        user=user,
        reason=reason,
    )


async def invalidate_analytics_dashboard(*, user: Optional[dict] = None, reason: str = "") -> str:
    return await _publish_projection(
        DomainEventType.PROJECTION_ANALYTICS_DASHBOARD.value,
        "analytics_dashboard_snapshot",
        user=user,
        reason=reason,
    )


PROJECTION_INVALIDATORS = {
    DomainEventType.PROJECTION_EXECUTIVE_KPI.value: invalidate_executive_kpi,
    DomainEventType.PROJECTION_EXECUTIVE_DASHBOARD.value: invalidate_executive_dashboard,
    DomainEventType.PROJECTION_WORK_EXECUTION_KPI.value: invalidate_work_execution_kpi,
    DomainEventType.PROJECTION_ASSET_HEALTH.value: invalidate_asset_health,
    DomainEventType.PROJECTION_RIL_DASHBOARD.value: invalidate_ril_dashboard,
    DomainEventType.PROJECTION_PRODUCTION_DASHBOARD.value: invalidate_production_dashboard,
    DomainEventType.PROJECTION_INSIGHTS_SUMMARY.value: invalidate_insights_summary,
    DomainEventType.PROJECTION_ANALYTICS_DASHBOARD.value: invalidate_analytics_dashboard,
}
