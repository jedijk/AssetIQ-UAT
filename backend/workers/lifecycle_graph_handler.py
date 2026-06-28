"""Lifecycle domain events → reliability graph sync (Wave 3 convergence)."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger("assetiq.workers.lifecycle_graph")


async def _load_threat(threat_id: str, tenant_id: Optional[str] = None) -> Optional[dict]:
    from database import db

    query: Dict[str, Any] = {"id": threat_id}
    if tenant_id:
        query["$or"] = [{"tenant_id": tenant_id}, {"company_id": tenant_id}]
    return await db.threats.find_one(query, {"_id": 0})


async def _load_observation(observation_id: str, tenant_id: Optional[str] = None) -> Optional[dict]:
    from database import db

    query: Dict[str, Any] = {"id": observation_id}
    if tenant_id:
        query["$or"] = [{"tenant_id": tenant_id}, {"company_id": tenant_id}]
    return await db.observations.find_one(query, {"_id": 0})


async def _load_action(action_id: str, tenant_id: Optional[str] = None) -> Optional[dict]:
    from database import db

    query: Dict[str, Any] = {"id": action_id}
    if tenant_id:
        query["$or"] = [{"tenant_id": tenant_id}, {"company_id": tenant_id}]
    return await db.central_actions.find_one(query, {"_id": 0})


async def _resolve_action_equipment_id(action: dict) -> Optional[str]:
    eq_id = action.get("linked_equipment_id")
    if eq_id:
        return eq_id
    threat_id = action.get("threat_id") or (
        action.get("source_id") if action.get("source_type") == "threat" else None
    )
    if not threat_id:
        return None
    threat = await _load_threat(threat_id, action.get("tenant_id") or action.get("company_id"))
    return (threat or {}).get("linked_equipment_id")


async def _resolve_action_failure_mode_id(action: dict) -> Optional[str]:
    fm_id = action.get("failure_mode_id")
    if fm_id:
        return str(fm_id)
    threat_id = action.get("threat_id") or (
        action.get("source_id") if action.get("source_type") == "threat" else None
    )
    if not threat_id:
        return None
    threat = await _load_threat(threat_id, action.get("tenant_id") or action.get("company_id"))
    fm = (threat or {}).get("failure_mode_id")
    return str(fm) if fm else None


async def handle_threat_created(event: dict) -> None:
    from services.reliability_graph import dispatch_graph_sync

    payload = event.get("payload") or {}
    threat_id = event.get("aggregate_id") or payload.get("threat_id")
    tenant_id = event.get("tenant_id")
    if not threat_id:
        return

    threat = await _load_threat(str(threat_id), tenant_id)
    if not threat:
        logger.warning("lifecycle graph: threat %s not found", threat_id)
        return

    await dispatch_graph_sync(
        "sync_threat_edges",
        "lifecycle_threat_created",
        threat_id=str(threat_id),
        equipment_id=threat.get("linked_equipment_id"),
        failure_mode_id=threat.get("failure_mode_id"),
        observation_id=threat.get("observation_id") or str(threat_id),
        tenant_id=tenant_id or threat.get("tenant_id") or threat.get("company_id"),
    )


async def handle_observation_created(event: dict) -> None:
    from services.reliability_graph import dispatch_graph_sync

    payload = event.get("payload") or {}
    observation_id = payload.get("observation_id") or event.get("aggregate_id")
    tenant_id = event.get("tenant_id")
    if not observation_id:
        return

    obs = await _load_observation(str(observation_id), tenant_id)
    if not obs:
        logger.warning("lifecycle graph: observation %s not found", observation_id)
        return

    await dispatch_graph_sync(
        "sync_observation_edges",
        "lifecycle_observation_created",
        observation_id=str(observation_id),
        equipment_id=obs.get("equipment_id") or payload.get("equipment_id"),
        failure_mode_id=obs.get("failure_mode_id"),
        threat_id=obs.get("threat_id") or str(observation_id),
        tenant_id=tenant_id or obs.get("tenant_id") or obs.get("company_id"),
    )


async def handle_action_completed(event: dict) -> None:
    from services.reliability_graph import dispatch_graph_sync

    action_id = event.get("aggregate_id")
    tenant_id = event.get("tenant_id")
    if not action_id:
        return

    action = await _load_action(str(action_id), tenant_id)
    if not action:
        logger.warning("lifecycle graph: action %s not found", action_id)
        return

    equipment_id = await _resolve_action_equipment_id(action)
    if not equipment_id:
        return

    await dispatch_graph_sync(
        "sync_outcome_edges",
        "lifecycle_action_completed",
        action_id=str(action_id),
        outcome_id=str(uuid.uuid4()),
        equipment_id=equipment_id,
        verification_status="verified",
        effectiveness=action.get("completion_notes"),
        tenant_id=tenant_id or action.get("tenant_id") or action.get("company_id"),
    )


async def handle_form_submission_created(event: dict) -> None:
    from services.reliability_graph_entities import sync_form_submission_edges

    payload = event.get("payload") or {}
    submission_id = payload.get("form_submission_id") or event.get("aggregate_id")
    task_instance_id = payload.get("task_instance_id")
    tenant_id = event.get("tenant_id")
    if not submission_id or not task_instance_id:
        return

    await sync_form_submission_edges(
        form_submission_id=str(submission_id),
        task_instance_id=str(task_instance_id),
        equipment_id=payload.get("equipment_id"),
        tenant_id=tenant_id,
    )


def lifecycle_graph_event_handlers() -> Dict[str, Callable[..., Any]]:
    from services.domain_events import DomainEventType

    return {
        DomainEventType.THREAT_CREATED.value: handle_threat_created,
        DomainEventType.OBSERVATION_CREATED.value: handle_observation_created,
        DomainEventType.ACTION_COMPLETED.value: handle_action_completed,
        DomainEventType.FORM_SUBMISSION_CREATED.value: handle_form_submission_created,
    }
