"""
Graph sync registry — handler map, domain event types, and static coverage checks.

Used by dispatch_graph_sync, graph_projection_handler, verify_reliability_graph_sync,
and graph_coverage_report.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, FrozenSet, List, Mapping, MutableMapping, Optional, Tuple

from services.domain_events import DomainEventType, GRAPH_EVENT_TYPES

Handler = Callable[..., Any]

SYNC_NAME_TO_EVENT_TYPE: Dict[str, str] = {
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

EVENT_TYPE_TO_SYNC_NAME: Dict[str, str] = {
    event_type: sync_name for sync_name, event_type in SYNC_NAME_TO_EVENT_TYPE.items()
}

# Handlers invoked by backfill_reliability_graph_history.py (static coverage gate).
BACKFILL_SYNC_HANDLERS: FrozenSet[str] = frozenset({
    "sync_edges_for_apply_strategy",
    "sync_edges_for_scheduled_task",
    "sync_task_instance_completion_edges",
    "sync_edge_for_pm_import_task",
    "sync_observation_edges",
    "sync_threat_edges",
    "sync_investigation_edges",
    "sync_cause_edge",
    "sync_action_edges",
    "sync_outcome_edges",
    "sync_prediction_edges",
})

# Direct upsert paths outside dispatch_graph_sync (documented in ownership matrix).
DIRECT_UPSERT_HANDLERS: FrozenSet[str] = frozenset({
    "sync_spare_part_equipment_links",
    "sync_entity_requires_spare_parts",
    "sync_finding_to_observation_edge",
    "sync_instantiated_as_edge",
    "sync_pm_import_program_task_links",
    "_sync_finding_from_completion",
    "annotate_equipment_failure_mode_risk",
    "sync_form_submission_edges",
})

_HANDLERS_CACHE: Optional[Dict[str, Handler]] = None


def build_graph_sync_handlers() -> Dict[str, Handler]:
    """Load handler callables lazily to avoid import-time database initialization."""
    from services.reliability_graph_entities import (
        sync_action_edges,
        sync_cause_edge,
        sync_investigation_edges,
        sync_observation_edges,
        sync_outcome_edges,
        sync_threat_edges,
    )
    from services.reliability_graph_core import sync_prediction_edges
    from services.reliability_graph_strategy import (
        sync_edge_for_pm_import_task,
        sync_edges_for_apply_strategy,
        sync_edges_for_scheduled_task,
        sync_task_instance_completion_edges,
    )

    return {
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


class _LazyHandlerRegistry(MutableMapping[str, Handler]):
    """Dict-like registry that loads handlers on first access."""

    def _handlers(self) -> Dict[str, Handler]:
        global _HANDLERS_CACHE
        if _HANDLERS_CACHE is None:
            _HANDLERS_CACHE = build_graph_sync_handlers()
        return _HANDLERS_CACHE

    def __getitem__(self, key: str) -> Handler:
        return self._handlers()[key]

    def __setitem__(self, key: str, value: Handler) -> None:
        self._handlers()[key] = value

    def __delitem__(self, key: str) -> None:
        del self._handlers()[key]

    def __iter__(self):
        return iter(self._handlers())

    def __len__(self) -> int:
        return len(self._handlers())

    def get(self, key: str, default: Any = None) -> Any:
        return self._handlers().get(key, default)

    def keys(self):
        return self._handlers().keys()

    def items(self):
        return self._handlers().items()

    def values(self):
        return self._handlers().values()


GRAPH_SYNC_HANDLERS: Mapping[str, Handler] = _LazyHandlerRegistry()


@dataclass(frozen=True)
class SpecEdgeMapping:
    """Functional-spec §1.2 edge name mapped to canonical Mongo relation(s)."""

    spec_name: str
    relations: Tuple[str, ...]
    source_type: str
    target_type: str
    owner: str
    status: str  # implemented | partial | gap
    notes: str = ""


# Sprint 1 spec edge inventory — spec names are logical; relations match reliability_ontology.
SPEC_EDGE_MAPPINGS: Tuple[SpecEdgeMapping, ...] = (
    SpecEdgeMapping(
        "equipment_has_observation",
        ("observed_on",),
        "observation",
        "equipment",
        "sync_observation_edges",
        "implemented",
    ),
    SpecEdgeMapping(
        "observation_has_investigation",
        ("triggered_investigation",),
        "threat",
        "investigation",
        "sync_investigation_edges",
        "implemented",
        "Observation/threat same-id; edge stored threat→investigation.",
    ),
    SpecEdgeMapping(
        "investigation_has_action",
        ("generated_action",),
        "investigation",
        "action",
        "sync_action_edges",
        "implemented",
        "Source may be cause or threat per action provenance.",
    ),
    SpecEdgeMapping(
        "observation_matches_failure_mode",
        ("indicates_failure_mode",),
        "observation",
        "failure_mode",
        "sync_observation_edges",
        "implemented",
    ),
    SpecEdgeMapping(
        "action_addresses_failure_mode",
        ("mitigates_failure_mode",),
        "action",
        "failure_mode",
        "sync_action_edges",
        "implemented",
        "Direct action→failure_mode when action targets FM; also task/schedule paths.",
    ),
    SpecEdgeMapping(
        "failure_mode_has_strategy",
        ("has_failure_mode", "has_strategy_type"),
        "equipment",
        "failure_mode",
        "sync_edges_for_apply_strategy",
        "implemented",
    ),
    SpecEdgeMapping(
        "strategy_applied_to_equipment",
        ("has_strategy_type", "has_program"),
        "equipment",
        "equipment_type_strategy",
        "sync_edges_for_apply_strategy",
        "implemented",
    ),
    SpecEdgeMapping(
        "strategy_generates_program",
        ("has_program", "governed_by", "contains_task"),
        "equipment",
        "maintenance_program_v2",
        "sync_edges_for_apply_strategy",
        "implemented",
    ),
    SpecEdgeMapping(
        "program_generates_scheduled_task",
        ("derived_from", "scheduled_for"),
        "scheduled_task",
        "program_task",
        "sync_edges_for_scheduled_task",
        "implemented",
    ),
    SpecEdgeMapping(
        "scheduled_task_creates_task_instance",
        ("instantiated_as",),
        "scheduled_task",
        "task_instance",
        "sync_task_instance_completion_edges",
        "implemented",
    ),
    SpecEdgeMapping(
        "task_instance_generates_evidence",
        ("yielded_finding", "found_on"),
        "task_completion",
        "finding",
        "sync_task_instance_completion_edges",
        "implemented",
    ),
    SpecEdgeMapping(
        "evidence_supports_observation",
        ("raised_observation",),
        "finding",
        "observation",
        "sync_finding_to_observation_edge",
        "implemented",
        "Direct upsert via sync_finding_to_observation_edge.",
    ),
    SpecEdgeMapping(
        "action_reduces_risk",
        ("impacted_reliability", "affects_equipment"),
        "outcome",
        "reliability_impact",
        "sync_outcome_edges",
        "partial",
        "Risk reduction modeled via outcome→impact→equipment chain.",
    ),
    SpecEdgeMapping(
        "outcome_validates_action",
        ("resulted_in",),
        "action",
        "outcome",
        "sync_outcome_edges",
        "implemented",
    ),
    SpecEdgeMapping(
        "equipment_has_spare_requirement",
        ("requires",),
        "program_task",
        "spare_part",
        "sync_entity_requires_spare_parts",
        "implemented",
        "Also action→spare_part requires edges.",
    ),
    SpecEdgeMapping(
        "spare_part_used_by_task",
        ("requires", "used_on"),
        "program_task",
        "spare_part",
        "sync_entity_requires_spare_parts",
        "implemented",
    ),
    SpecEdgeMapping(
        "form_submission_supports_task",
        ("supports",),
        "form_submission",
        "task_instance",
        "sync_form_submission_edges",
        "implemented",
    ),
    SpecEdgeMapping(
        "executive_kpi_derived_from_graph",
        (),
        "reliability_edges",
        "executive_kpi",
        "graph_kpi_aggregator",
        "partial",
        "Read-model projection — not a reliability_edges relation.",
    ),
)


def graph_event_type(sync_name: str) -> str:
    return SYNC_NAME_TO_EVENT_TYPE.get(sync_name, f"graph.{sync_name}")


def validate_handler_registration() -> List[str]:
    """Every registered handler must map to a domain event type."""
    failures: List[str] = []
    handler_names = set(GRAPH_SYNC_HANDLERS.keys())
    for sync_name in sorted(handler_names):
        if sync_name not in SYNC_NAME_TO_EVENT_TYPE:
            failures.append(f"handler {sync_name} missing SYNC_NAME_TO_EVENT_TYPE entry")
    for event_type in GRAPH_EVENT_TYPES:
        if event_type.value not in EVENT_TYPE_TO_SYNC_NAME:
            failures.append(f"GRAPH_EVENT_TYPES entry {event_type.value} missing handler mapping")
        elif EVENT_TYPE_TO_SYNC_NAME[event_type.value] not in handler_names:
            failures.append(
                f"event {event_type.value} maps to unregistered handler "
                f"{EVENT_TYPE_TO_SYNC_NAME[event_type.value]}"
            )
    return failures


def validate_spec_edge_registry() -> List[str]:
    """Flag spec edges marked implemented but missing from handler/direct upsert registry."""
    failures: List[str] = []
    known_handlers = set(GRAPH_SYNC_HANDLERS.keys()) | DIRECT_UPSERT_HANDLERS
    for row in SPEC_EDGE_MAPPINGS:
        if row.status != "implemented":
            continue
        if row.owner not in known_handlers:
            failures.append(f"spec edge {row.spec_name}: owner {row.owner} not in registry")
    return failures


def validate_backfill_coverage() -> List[str]:
    """Handlers without backfill support (informational gaps for Sprint 2)."""
    gaps: List[str] = []
    for sync_name in sorted(GRAPH_SYNC_HANDLERS.keys()):
        if sync_name not in BACKFILL_SYNC_HANDLERS:
            gaps.append(f"backfill missing handler: {sync_name}")
    return gaps


def spec_edge_gaps() -> List[SpecEdgeMapping]:
    return [row for row in SPEC_EDGE_MAPPINGS if row.status in ("partial", "gap")]


def idempotency_key(
    *,
    tenant_id: str,
    relation: str,
    source_id: str,
    target_id: str,
) -> str:
    """Logical idempotency key per functional spec (tenant-scoped)."""
    return f"{tenant_id}:{relation}:{source_id}:{target_id}"


def registry_summary() -> Dict[str, Any]:
    return {
        "handlers_registered": len(GRAPH_SYNC_HANDLERS),
        "event_types_mapped": len(SYNC_NAME_TO_EVENT_TYPE),
        "spec_edges_total": len(SPEC_EDGE_MAPPINGS),
        "spec_edges_implemented": sum(1 for r in SPEC_EDGE_MAPPINGS if r.status == "implemented"),
        "spec_edges_partial": sum(1 for r in SPEC_EDGE_MAPPINGS if r.status == "partial"),
        "spec_edges_gap": sum(1 for r in SPEC_EDGE_MAPPINGS if r.status == "gap"),
        "backfill_handlers": len(BACKFILL_SYNC_HANDLERS),
        "backfill_gaps": validate_backfill_coverage(),
    }
