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
from services.tenant_schema import merge_tenant_filter, with_tenant_id
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
})

# Modules allowed to update ``threats`` directly (enforced in architecture tests).
THREAT_UPDATE_ALLOWLIST = frozenset({
    "services/work_signal_lifecycle.py",
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


def observation_doc_from_threat(threat: Dict[str, Any], *, user: Optional[dict] = None) -> Dict[str, Any]:
    """Build a same-id canonical observation document from a threat record."""
    signal_id = threat.get("id")
    if not signal_id:
        raise ValueError("threat id required")
    doc = threat_to_observation_doc(threat, user=user)
    doc["id"] = signal_id
    doc.pop("legacy_threat_id", None)
    if doc.get("source") == "threat_mirror":
        doc["source"] = threat.get("source") or "convergence_backfill"
    return doc


async def ensure_observation_for_signal(
    signal_id: str,
    *,
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Return canonical observation for ``signal_id``, creating from threat if missing."""
    filt = merge_tenant_filter({"id": signal_id}, user)
    existing = await db.observations.find_one(filt, {"_id": 0})
    if existing:
        return existing

    legacy = await db.observations.find_one(
        merge_tenant_filter({"legacy_threat_id": signal_id}, user),
        {"_id": 0},
    )
    if legacy:
        threat = await db.threats.find_one(filt, {"_id": 0})
        base = {**legacy, **(threat or {}), "id": signal_id}
        doc = observation_doc_from_threat(base, user=user)
        await db.observations.update_one(
            merge_tenant_filter({"id": signal_id}, user),
            {"$set": {k: v for k, v in doc.items() if k != "_id"}},
            upsert=True,
        )
        if legacy.get("id") != signal_id:
            await db.observations.delete_one(
                merge_tenant_filter({"id": legacy["id"]}, user),
            )
        return doc

    threat = await db.threats.find_one(filt, {"_id": 0})
    if not threat:
        return None

    doc = observation_doc_from_threat(threat, user=user)
    await db.observations.insert_one(doc)
    return doc


async def update_work_signal(
    signal_id: str,
    *,
    user: Optional[dict] = None,
    set_fields: Optional[Dict[str, Any]] = None,
    push_fields: Optional[Dict[str, Any]] = None,
    graph_label: str = "work_signal_update",
    sync_graph: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Canonical update: merge into observation, sync threat projection, optional graph.

    ``set_fields`` / ``push_fields`` use legacy threat field names where applicable.
    """
    if not signal_id:
        return None
    if not set_fields and not push_fields:
        return await db.threats.find_one(
            merge_tenant_filter({"id": signal_id}, user),
            {"_id": 0},
        )

    threat_filt = merge_tenant_filter({"id": signal_id}, user)
    threat = await db.threats.find_one(threat_filt, {"_id": 0})
    observation = await ensure_observation_for_signal(signal_id, user=user)
    if not observation and not threat:
        return None

    now = datetime.now(timezone.utc).isoformat()
    merged_threat = {**(threat or observation or {}), **(set_fields or {}), "id": signal_id}
    merged_obs = observation_doc_from_threat(merged_threat, user=user)
    for key, val in merged_threat.items():
        if key not in ("_id", "legacy_threat_id"):
            merged_obs[key] = val
    merged_obs["id"] = signal_id
    merged_obs.pop("legacy_threat_id", None)
    merged_obs["updated_at"] = now
    with_tenant_id(merged_obs, user)

    obs_ops: Dict[str, Any] = {"$set": {k: v for k, v in merged_obs.items() if k != "_id"}}
    if push_fields:
        for pk, pv in push_fields.items():
            obs_key = "media_urls" if pk == "attachments" else pk
            obs_ops.setdefault("$push", {})[obs_key] = pv

    await db.observations.update_one(
        merge_tenant_filter({"id": signal_id}, user),
        obs_ops,
        upsert=True,
    )

    threat_proj = observation_to_threat_projection(
        merged_obs,
        user=user,
        extra=merged_threat,
    )
    threat_proj["id"] = signal_id
    threat_proj["projection_of"] = "observation"
    threat_proj["updated_at"] = now
    threat_set = {k: v for k, v in threat_proj.items() if k not in ("_id",)}
    with_tenant_id(threat_set, user)

    threat_ops: Dict[str, Any] = {"$set": threat_set}
    if push_fields:
        for pk, pv in push_fields.items():
            threat_ops.setdefault("$push", {})[pk] = pv

    if threat:
        await db.threats.update_one(threat_filt, threat_ops)
    else:
        await db.threats.insert_one(threat_proj)

    if sync_graph:
        await _sync_work_signal_graph(
            signal_id,
            merged_obs,
            graph_label,
            tenant_id=merged_obs.get("tenant_id"),
        )

    return await db.threats.find_one(threat_filt, {"_id": 0})
