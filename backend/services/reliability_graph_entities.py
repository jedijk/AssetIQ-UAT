"""Reliability graph — observation, threat, investigation, and outcome edges."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db

from services.reliability_graph_core import (
    OUTCOMES_COLLECTION,
    RELIABILITY_IMPACTS_COLLECTION,
    upsert_edge,
)

async def sync_finding_to_observation_edge(
    *,
    finding_id: str,
    observation_id: str,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Link finding → observation when triaged from maintenance."""
    await upsert_edge(
        source_type="finding",
        source_id=finding_id,
        relation="raised_observation",
        target_type="observation",
        target_id=observation_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
    )


async def sync_observation_edges(
    *,
    observation_id: str,
    equipment_id: Optional[str],
    failure_mode_id: Optional[str] = None,
    threat_id: Optional[str] = None,
    finding_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    escalate: bool = False,
) -> None:
    """Materialize observation graph edges (equipment, FM, threat links)."""
    if equipment_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="observed_on",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if failure_mode_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="indicates_failure_mode",
            target_type="failure_mode",
            target_id=str(failure_mode_id),
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if threat_id:
        relation = "escalated_to" if escalate else "linked_to_threat"
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation=relation,
            target_type="threat",
            target_id=threat_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
        if not escalate:
            await upsert_edge(
                source_type="observation",
                source_id=observation_id,
                relation="escalated_to",
                target_type="threat",
                target_id=threat_id,
                equipment_id=equipment_id,
                tenant_id=tenant_id,
            )
    if finding_id:
        await sync_finding_to_observation_edge(
            finding_id=finding_id,
            observation_id=observation_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )


async def sync_threat_edges(
    *,
    threat_id: str,
    equipment_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    observation_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize threat → equipment / failure_mode edges."""
    if equipment_id:
        await upsert_edge(
            source_type="threat",
            source_id=threat_id,
            relation="linked_to_equipment",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if failure_mode_id:
        await upsert_edge(
            source_type="threat",
            source_id=threat_id,
            relation="indicates_failure_mode",
            target_type="failure_mode",
            target_id=str(failure_mode_id),
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if observation_id:
        await sync_observation_edges(
            observation_id=observation_id,
            equipment_id=equipment_id,
            failure_mode_id=failure_mode_id,
            threat_id=threat_id,
            tenant_id=tenant_id,
            escalate=True,
        )


async def sync_investigation_edges(
    *,
    investigation_id: str,
    threat_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize threat → investigation on investigation open."""
    if threat_id:
        await upsert_edge(
            source_type="threat",
            source_id=threat_id,
            relation="triggered_investigation",
            target_type="investigation",
            target_id=investigation_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )


async def sync_cause_edge(
    *,
    investigation_id: str,
    cause_id: str,
    equipment_id: Optional[str] = None,
    is_root_cause: bool = False,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize investigation → cause on RCA."""
    await upsert_edge(
        source_type="investigation",
        source_id=investigation_id,
        relation="identified_cause",
        target_type="cause",
        target_id=cause_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"is_root_cause": is_root_cause},
    )


async def sync_action_edges(
    *,
    action_id: str,
    source_type: str,
    source_id: str,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize investigation/cause/threat → action and action → equipment."""
    await upsert_edge(
        source_type=source_type,
        source_id=source_id,
        relation="generated_action",
        target_type="action",
        target_id=action_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
    )
    if equipment_id:
        await upsert_edge(
            source_type="action",
            source_id=action_id,
            relation="assigned_to_equipment",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )


async def sync_outcome_edges(
    *,
    action_id: str,
    outcome_id: str,
    equipment_id: str,
    verification_status: str = "verified",
    effectiveness: Optional[str] = None,
    metric_type: str = "mtbf_proxy_days",
    delta: Optional[float] = None,
    window_days: int = 90,
    tenant_id: Optional[str] = None,
) -> Dict[str, str]:
    """
    Close the reliability loop: action → outcome → reliability_impact → equipment.
    Creates outcome and reliability_impact documents plus graph edges.
    """
    now = datetime.now(timezone.utc).isoformat()
    outcome_doc: Dict[str, Any] = {
        "id": outcome_id,
        "action_id": action_id,
        "verification_status": verification_status,
        "verified_at": now,
        "effectiveness": effectiveness,
        "equipment_id": equipment_id,
        "created_at": now,
    }
    if tenant_id:
        outcome_doc["tenant_id"] = tenant_id
    await db[OUTCOMES_COLLECTION].insert_one(outcome_doc)

    impact_id = str(uuid.uuid4())
    impact_doc: Dict[str, Any] = {
        "id": impact_id,
        "outcome_id": outcome_id,
        "equipment_id": equipment_id,
        "metric_type": metric_type,
        "delta": delta,
        "window_days": window_days,
        "created_at": now,
    }
    if tenant_id:
        impact_doc["tenant_id"] = tenant_id
    await db[RELIABILITY_IMPACTS_COLLECTION].insert_one(impact_doc)

    await upsert_edge(
        source_type="action",
        source_id=action_id,
        relation="resulted_in",
        target_type="outcome",
        target_id=outcome_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"verification_status": verification_status},
    )
    await upsert_edge(
        source_type="outcome",
        source_id=outcome_id,
        relation="impacted_reliability",
        target_type="reliability_impact",
        target_id=impact_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"metric_type": metric_type, "delta": delta},
    )
    await upsert_edge(
        source_type="reliability_impact",
        source_id=impact_id,
        relation="affects_equipment",
        target_type="equipment",
        target_id=equipment_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"window_days": window_days},
    )
    return {"outcome_id": outcome_id, "impact_id": impact_id}
