"""
Domain event type registry — Wave 3 event-driven foundation.

Events are persisted via the outbox before async processing.
"""
from __future__ import annotations

from enum import Enum


class DomainEventType(str, Enum):
    # Reliability graph projections
    GRAPH_SYNC_OBSERVATION = "graph.sync_observation_edges"
    GRAPH_SYNC_THREAT = "graph.sync_threat_edges"
    GRAPH_SYNC_INVESTIGATION = "graph.sync_investigation_edges"
    GRAPH_SYNC_CAUSE = "graph.sync_cause_edge"
    GRAPH_SYNC_ACTION = "graph.sync_action_edges"
    GRAPH_SYNC_OUTCOME = "graph.sync_outcome_edges"
    GRAPH_SYNC_SCHEDULED_TASK = "graph.sync_edges_for_scheduled_task"
    GRAPH_SYNC_TASK_COMPLETION = "graph.sync_task_instance_completion_edges"
    GRAPH_SYNC_APPLY_STRATEGY = "graph.sync_edges_for_apply_strategy"

    # Domain lifecycle (outbox-ready; handlers added incrementally)
    THREAT_CREATED = "threat.created"
    OBSERVATION_CREATED = "observation.created"
    ACTION_COMPLETED = "action.completed"
    TASK_COMPLETED = "task.completed"
    INVESTIGATION_CLOSED = "investigation.closed"
    STRATEGY_APPLIED = "strategy.applied"

    # Read model refresh
    PROJECTION_EXECUTIVE_KPI = "projection.executive_kpi"
    PROJECTION_WORK_EXECUTION_KPI = "projection.work_execution_kpi"
    PROJECTION_ASSET_HEALTH = "projection.asset_health"


GRAPH_EVENT_TYPES = frozenset({
    DomainEventType.GRAPH_SYNC_OBSERVATION,
    DomainEventType.GRAPH_SYNC_THREAT,
    DomainEventType.GRAPH_SYNC_INVESTIGATION,
    DomainEventType.GRAPH_SYNC_CAUSE,
    DomainEventType.GRAPH_SYNC_ACTION,
    DomainEventType.GRAPH_SYNC_OUTCOME,
    DomainEventType.GRAPH_SYNC_SCHEDULED_TASK,
    DomainEventType.GRAPH_SYNC_TASK_COMPLETION,
    DomainEventType.GRAPH_SYNC_APPLY_STRATEGY,
})

PROJECTION_EVENT_TYPES = frozenset({
    DomainEventType.PROJECTION_EXECUTIVE_KPI,
    DomainEventType.PROJECTION_WORK_EXECUTION_KPI,
    DomainEventType.PROJECTION_ASSET_HEALTH,
})
