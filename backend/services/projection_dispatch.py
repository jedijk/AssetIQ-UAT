"""
Read-model projection invalidation — Wave 3 projection convergence.

Dashboard refreshes enqueue via outbox instead of inline aggregation in routes.
"""
from __future__ import annotations

from typing import Optional

from services.domain_events import DomainEventType, PROJECTION_EVENT_TYPES
from services.event_outbox import publish_event
from services.tenant_schema import tenant_id_from_user


async def invalidate_executive_kpi(*, user: Optional[dict] = None, reason: str = "") -> str:
    tid = tenant_id_from_user(user) or "system"
    return await publish_event(
        event_type=DomainEventType.PROJECTION_EXECUTIVE_KPI.value,
        aggregate_type="executive_kpi_snapshot",
        aggregate_id=tid,
        payload={"reason": reason},
        user=user,
        tenant_id=tid,
    )


async def invalidate_work_execution_kpi(*, user: Optional[dict] = None, reason: str = "") -> str:
    tid = tenant_id_from_user(user) or "system"
    return await publish_event(
        event_type=DomainEventType.PROJECTION_WORK_EXECUTION_KPI.value,
        aggregate_type="work_execution_kpi_snapshot",
        aggregate_id=tid,
        payload={"reason": reason},
        user=user,
        tenant_id=tid,
    )


async def invalidate_asset_health(*, user: Optional[dict] = None, reason: str = "") -> str:
    tid = tenant_id_from_user(user) or "system"
    return await publish_event(
        event_type=DomainEventType.PROJECTION_ASSET_HEALTH.value,
        aggregate_type="asset_health_document",
        aggregate_id=tid,
        payload={"reason": reason},
        user=user,
        tenant_id=tid,
    )


PROJECTION_INVALIDATORS = {
    DomainEventType.PROJECTION_EXECUTIVE_KPI.value: invalidate_executive_kpi,
    DomainEventType.PROJECTION_WORK_EXECUTION_KPI.value: invalidate_work_execution_kpi,
    DomainEventType.PROJECTION_ASSET_HEALTH.value: invalidate_asset_health,
}
