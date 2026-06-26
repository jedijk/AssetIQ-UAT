"""
Reliability knowledge graph — lightweight edge store in MongoDB.

Thin facade re-exporting split modules and graph sync dispatch registry.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Callable, Dict

from services.reliability_graph_core import (
    COLLECTION,
    EDGE_STATUS_ACTIVE,
    EDGE_STATUS_RETIRED,
    FINDINGS_COLLECTION,
    OUTCOMES_COLLECTION,
    RELIABILITY_IMPACTS_COLLECTION,
    _edge_tenant_clause,
    _merge_edge_query,
    _run_graph_sync,
    annotate_equipment_failure_mode_risk,
    edge_document_id,
    ensure_reliability_graph_indexes,
    get_edges_for_equipment,
    get_edges_for_node,
    graph_sync_async_enabled,
    retire_edges_for_entity,
    retire_stale_program_task_edges,
    sync_prediction_edges,
    upsert_edge,
)
from services.reliability_graph_entities import (
    sync_action_edges,
    sync_cause_edge,
    sync_finding_to_observation_edge,
    sync_investigation_edges,
    sync_observation_edges,
    sync_outcome_edges,
    sync_threat_edges,
)
from services.reliability_graph_strategy import (
    _sync_finding_from_completion,
    sync_edge_for_pm_import_task,
    sync_edges_for_apply_strategy,
    sync_edges_for_scheduled_task,
    sync_instantiated_as_edge,
    sync_pm_import_program_task_links,
    sync_task_instance_completion_edges,
)

logger = logging.getLogger(__name__)

_GRAPH_SYNC_EVENT_TYPES: Dict[str, str] = {}


def _graph_event_type(sync_name: str) -> str:
    if sync_name not in _GRAPH_SYNC_EVENT_TYPES:
        from services.domain_events import DomainEventType

        mapping = {
            "sync_observation_edges": DomainEventType.GRAPH_SYNC_OBSERVATION.value,
            "sync_threat_edges": DomainEventType.GRAPH_SYNC_THREAT.value,
            "sync_investigation_edges": DomainEventType.GRAPH_SYNC_INVESTIGATION.value,
            "sync_cause_edge": DomainEventType.GRAPH_SYNC_CAUSE.value,
            "sync_action_edges": DomainEventType.GRAPH_SYNC_ACTION.value,
            "sync_outcome_edges": DomainEventType.GRAPH_SYNC_OUTCOME.value,
            "sync_edges_for_scheduled_task": DomainEventType.GRAPH_SYNC_SCHEDULED_TASK.value,
            "sync_task_instance_completion_edges": DomainEventType.GRAPH_SYNC_TASK_COMPLETION.value,
            "sync_edges_for_apply_strategy": DomainEventType.GRAPH_SYNC_APPLY_STRATEGY.value,
            "sync_prediction_edges": DomainEventType.GRAPH_SYNC_PREDICTION.value,
            "sync_edge_for_pm_import_task": DomainEventType.GRAPH_SYNC_PM_IMPORT.value,
        }
        _GRAPH_SYNC_EVENT_TYPES.update(mapping)
    return _GRAPH_SYNC_EVENT_TYPES.get(sync_name, f"graph.{sync_name}")


async def dispatch_graph_sync(sync_name: str, label: str, **kwargs: Any) -> None:
    """
    Run graph sync inline or enqueue via outbox when GRAPH_SYNC_ASYNC=true.

    All write-path graph updates should use this instead of calling sync_* directly.
    """
    if graph_sync_async_enabled():
        from services.event_outbox import publish_event

        aggregate_id = (
            kwargs.get("observation_id")
            or kwargs.get("threat_id")
            or kwargs.get("investigation_id")
            or kwargs.get("action_id")
            or kwargs.get("task_instance_id")
            or kwargs.get("equipment_type_id")
            or (kwargs.get("scheduled_task") or {}).get("id")
            or label
        )
        await publish_event(
            event_type=_graph_event_type(sync_name),
            aggregate_type="reliability_graph",
            aggregate_id=str(aggregate_id),
            payload={"sync_name": sync_name, "kwargs": kwargs, "label": label},
            tenant_id=kwargs.get("tenant_id"),
        )
        try:
            from services.observability_metrics import inc
            inc("graph_sync_enqueued_total")
        except Exception:
            pass
        return

    handler = GRAPH_SYNC_HANDLERS.get(sync_name)
    if not handler:
        raise ValueError(f"unknown graph sync handler: {sync_name}")

    if sync_name == "sync_edges_for_scheduled_task":
        task_doc = kwargs.get("scheduled_task") or kwargs.get("task_doc") or {}
        event_name = kwargs.get("event", "created")
        await _run_graph_sync(handler(task_doc, event=event_name), label)
        return

    await _run_graph_sync(handler(**kwargs), label)
    try:
        from services.observability_metrics import inc
        inc("graph_sync_inline_total")
    except Exception:
        pass


GRAPH_SYNC_HANDLERS: Dict[str, Callable[..., Any]] = {
    "sync_observation_edges": sync_observation_edges,
    "sync_threat_edges": sync_threat_edges,
    "sync_investigation_edges": sync_investigation_edges,
    "sync_prediction_edges": sync_prediction_edges,
    "sync_cause_edge": sync_cause_edge,
    "sync_action_edges": sync_action_edges,
    "sync_outcome_edges": sync_outcome_edges,
    "sync_edges_for_scheduled_task": sync_edges_for_scheduled_task,
    "sync_task_instance_completion_edges": sync_task_instance_completion_edges,
    "sync_edges_for_apply_strategy": sync_edges_for_apply_strategy,
    "sync_edge_for_pm_import_task": sync_edge_for_pm_import_task,
}

__all__ = [
    "COLLECTION",
    "EDGE_STATUS_ACTIVE",
    "EDGE_STATUS_RETIRED",
    "FINDINGS_COLLECTION",
    "GRAPH_SYNC_HANDLERS",
    "OUTCOMES_COLLECTION",
    "RELIABILITY_IMPACTS_COLLECTION",
    "_edge_tenant_clause",
    "_merge_edge_query",
    "_run_graph_sync",
    "_sync_finding_from_completion",
    "annotate_equipment_failure_mode_risk",
    "dispatch_graph_sync",
    "edge_document_id",
    "ensure_reliability_graph_indexes",
    "get_edges_for_equipment",
    "get_edges_for_node",
    "graph_sync_async_enabled",
    "retire_edges_for_entity",
    "retire_stale_program_task_edges",
    "sync_action_edges",
    "sync_cause_edge",
    "sync_edge_for_pm_import_task",
    "sync_edges_for_apply_strategy",
    "sync_edges_for_scheduled_task",
    "sync_finding_to_observation_edge",
    "sync_instantiated_as_edge",
    "sync_investigation_edges",
    "sync_observation_edges",
    "sync_outcome_edges",
    "sync_pm_import_program_task_links",
    "sync_prediction_edges",
    "sync_task_instance_completion_edges",
    "sync_threat_edges",
    "upsert_edge",
]
