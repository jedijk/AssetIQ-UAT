"""
Lifecycle domain events — Wave 3 event convergence.

Cross-domain side effects publish through the outbox instead of synchronous writes.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from services.domain_events import DomainEventType
from services.event_outbox import publish_event
from services.tenant_schema import tenant_id_from_user


async def publish_lifecycle_event(
    event_type: DomainEventType,
    *,
    aggregate_type: str,
    aggregate_id: str,
    payload: Optional[Dict[str, Any]] = None,
    user: Optional[dict] = None,
) -> str:
    tenant_id = tenant_id_from_user(user)
    return await publish_event(
        event_type=event_type.value,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload or {},
        user=user,
        tenant_id=tenant_id,
    )


async def publish_action_completed(
    action_id: str,
    *,
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> str:
    return await publish_lifecycle_event(
        DomainEventType.ACTION_COMPLETED,
        aggregate_type="central_action",
        aggregate_id=action_id,
        payload={"source_type": source_type, "source_id": source_id},
        user=user,
    )


async def publish_action_outcome_assessed(
    action_id: str,
    *,
    outcome_status: str,
    risk_reduction_pct: float,
    exposure_reduction: float,
    equipment_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> str:
    return await publish_lifecycle_event(
        DomainEventType.ACTION_OUTCOME_ASSESSED,
        aggregate_type="central_action",
        aggregate_id=action_id,
        payload={
            "outcome_status": outcome_status,
            "risk_reduction_pct": risk_reduction_pct,
            "exposure_reduction": exposure_reduction,
            "equipment_id": equipment_id,
        },
        user=user,
    )


async def publish_threat_created(threat_id: str, *, user: Optional[dict] = None) -> str:
    return await publish_lifecycle_event(
        DomainEventType.THREAT_CREATED,
        aggregate_type="threat",
        aggregate_id=threat_id,
        user=user,
    )


async def publish_observation_created(observation_id: str, *, user: Optional[dict] = None) -> str:
    return await publish_lifecycle_event(
        DomainEventType.OBSERVATION_CREATED,
        aggregate_type="observation",
        aggregate_id=observation_id,
        user=user,
    )


async def publish_form_submission_created(
    submission_id: str,
    *,
    task_instance_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> str:
    return await publish_lifecycle_event(
        DomainEventType.FORM_SUBMISSION_CREATED,
        aggregate_type="form_submission",
        aggregate_id=submission_id,
        payload={
            "form_submission_id": submission_id,
            "task_instance_id": task_instance_id,
            "equipment_id": equipment_id,
        },
        user=user,
    )
