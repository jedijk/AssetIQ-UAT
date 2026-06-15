"""
Canonical work signal lifecycle — Convergence Program Phase 3.

Lifecycle:
  Observation (canonical write)
    → Investigation
    → Action
    → Outcome

Threats collection holds a **read projection** for legacy API/UI compatibility.
New code must call ``create_work_signal`` instead of ``db.threats.insert_one``.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db
from services.tenant_schema import with_tenant_id
from services.threat_observation_bridge import threat_to_observation_doc

logger = logging.getLogger(__name__)

LIFECYCLE_STAGES = (
    "observation",
    "investigation",
    "action",
    "outcome",
)

# Modules allowed to insert into ``threats`` directly (enforced in architecture tests).
THREAT_INSERT_ALLOWLIST = frozenset({
    "services/work_signal_lifecycle.py",
    "services/chat_routes_service.py",  # transitional — calls create_work_signal
})


def observation_to_threat_projection(
    observation: Dict[str, Any],
    *,
    user: Optional[dict] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Project a canonical observation document into legacy threat shape."""
    status_raw = (observation.get("status") or "open").strip().lower()
    if status_raw in ("open", "observation", "in progress", "in_progress", "active"):
        threat_status = "Observation"
    elif status_raw in ("closed", "mitigated", "completed", "resolved"):
        threat_status = "Closed"
    else:
        threat_status = observation.get("status") or "Observation"

    title = observation.get("title")
    if not title:
        desc = observation.get("description") or ""
        title = desc[:120] if desc else "Observation"

    threat: Dict[str, Any] = {
        "id": observation.get("id"),
        "title": title,
        "description": observation.get("description") or "",
        "status": threat_status,
        "risk_level": observation.get("risk_level") or observation.get("severity") or "medium",
        "risk_score": observation.get("risk_score"),
        "failure_mode": observation.get("failure_mode_name") or observation.get("failure_mode"),
        "failure_mode_id": observation.get("failure_mode_id"),
        "linked_equipment_id": observation.get("equipment_id"),
        "equipment_id": observation.get("equipment_id"),
        "asset": observation.get("equipment_name") or observation.get("asset"),
        "source": observation.get("source"),
        "created_by": observation.get("created_by"),
        "created_at": observation.get("created_at"),
        "updated_at": observation.get("updated_at") or datetime.now(timezone.utc).isoformat(),
        "projection_of": "observation",
    }
    if extra:
        threat.update(extra)
    return with_tenant_id(threat, user)


async def _sync_work_signal_graph(
    signal_id: str,
    observation: Dict[str, Any],
    label: str,
    *,
    tenant_id: Optional[str] = None,
) -> None:
    from services.reliability_graph import dispatch_graph_sync

    equipment_id = observation.get("equipment_id")
    failure_mode_id = observation.get("failure_mode_id")
    tid = tenant_id or observation.get("tenant_id")
    await dispatch_graph_sync(
        "sync_observation_edges",
        label,
        observation_id=signal_id,
        equipment_id=equipment_id,
        failure_mode_id=failure_mode_id,
        tenant_id=tid,
    )
    await dispatch_graph_sync(
        "sync_threat_edges",
        label,
        threat_id=signal_id,
        equipment_id=equipment_id,
        failure_mode_id=failure_mode_id,
        tenant_id=tid,
    )


async def create_work_signal(
    signal_doc: Dict[str, Any],
    *,
    user: Optional[dict] = None,
    source: str = "manual",
    graph_label: str = "work_signal_create",
) -> Dict[str, Any]:
    """
    Canonical create path: observations first, threat projection, graph evidence.

    ``signal_doc`` may use legacy threat field names (title, linked_equipment_id, …).
    Returns ids with observation and threat sharing the same primary id.
    """
    signal_id = signal_doc.get("id") or str(uuid.uuid4())
    payload = {**signal_doc, "id": signal_id}
    with_tenant_id(payload, user)

    observation = threat_to_observation_doc(payload, user=user)
    observation["id"] = signal_id
    observation["source"] = source
    observation.pop("legacy_threat_id", None)

    threat_projection = observation_to_threat_projection(
        observation,
        user=user,
        extra={k: v for k, v in payload.items() if k not in observation},
    )
    threat_projection["id"] = signal_id

    await db.observations.insert_one(observation)
    await db.threats.insert_one(threat_projection)
    logger.info(
        "Created work signal %s (observation canonical, threat projection)",
        signal_id,
    )

    await _sync_work_signal_graph(
        signal_id,
        observation,
        graph_label,
        tenant_id=observation.get("tenant_id"),
    )

    try:
        from services.event_outbox import publish_event
        from services.domain_events import DomainEventType

        await publish_event(
            event_type=DomainEventType.OBSERVATION_CREATED.value,
            aggregate_type="observation",
            aggregate_id=signal_id,
            payload={"observation_id": signal_id, "equipment_id": observation.get("equipment_id")},
            tenant_id=observation.get("tenant_id"),
        )
    except Exception as exc:
        logger.debug("OBSERVATION_CREATED event skipped: %s", exc)

    return {
        "id": signal_id,
        "observation_id": signal_id,
        "threat_id": signal_id,
        "observation": observation,
        "threat_projection": threat_projection,
    }
