"""Graph sync registry — handler registration and spec edge coverage."""
import os

# Mirror verify script defaults so registry tests collect without live Mongo.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/graph-sync-test")
os.environ.setdefault("DB_NAME", "graph-sync-test")
os.environ.setdefault("JWT_SECRET_KEY", "graph-sync-test")
os.environ.setdefault("ENVIRONMENT", "test")

from services.domain_events import GRAPH_EVENT_TYPES
from services.reliability_graph import GRAPH_SYNC_HANDLERS
from services.reliability_graph.graph_sync_registry import (
    BACKFILL_SYNC_HANDLERS,
    EVENT_TYPE_TO_SYNC_NAME,
    SPEC_EDGE_MAPPINGS,
    SYNC_NAME_TO_EVENT_TYPE,
    graph_event_type,
    registry_summary,
    validate_backfill_coverage,
    validate_handler_registration,
    validate_spec_edge_registry,
)


def test_graph_sync_handlers_match_registry():
    from services.reliability_graph.graph_sync_registry import (
        GRAPH_SYNC_HANDLERS as registry_handlers,
        build_graph_sync_handlers,
    )

    assert dict(GRAPH_SYNC_HANDLERS) == build_graph_sync_handlers()
    assert dict(registry_handlers) == build_graph_sync_handlers()
    assert len(GRAPH_SYNC_HANDLERS) == 11


def test_every_handler_has_domain_event_type():
    assert validate_handler_registration() == []
    for sync_name in GRAPH_SYNC_HANDLERS:
        assert sync_name in SYNC_NAME_TO_EVENT_TYPE
        assert graph_event_type(sync_name) == SYNC_NAME_TO_EVENT_TYPE[sync_name]


def test_graph_event_types_map_to_handlers():
    for event_type in GRAPH_EVENT_TYPES:
        sync_name = EVENT_TYPE_TO_SYNC_NAME[event_type.value]
        assert sync_name in GRAPH_SYNC_HANDLERS


def test_spec_edge_inventory_complete():
    assert len(SPEC_EDGE_MAPPINGS) == 18
    names = {row.spec_name for row in SPEC_EDGE_MAPPINGS}
    expected = {
        "equipment_has_observation",
        "observation_has_investigation",
        "investigation_has_action",
        "observation_matches_failure_mode",
        "action_addresses_failure_mode",
        "failure_mode_has_strategy",
        "strategy_applied_to_equipment",
        "strategy_generates_program",
        "program_generates_scheduled_task",
        "scheduled_task_creates_task_instance",
        "task_instance_generates_evidence",
        "evidence_supports_observation",
        "action_reduces_risk",
        "outcome_validates_action",
        "equipment_has_spare_requirement",
        "spare_part_used_by_task",
        "form_submission_supports_task",
        "executive_kpi_derived_from_graph",
    }
    assert names == expected


def test_implemented_spec_edges_have_registered_owners():
    assert validate_spec_edge_registry() == []


def test_registry_summary_counts():
    summary = registry_summary()
    assert summary["handlers_registered"] == 11
    assert summary["event_types_mapped"] == 11
    assert summary["spec_edges_implemented"] >= 10
    assert summary["spec_edges_gap"] >= 1


def test_backfill_covers_major_handlers():
    gaps = validate_backfill_coverage()
    assert any("sync_prediction_edges" in msg for msg in gaps)
    assert not any("sync_edges_for_apply_strategy" in msg for msg in gaps)
    assert not any("sync_observation_edges" in msg for msg in gaps)
    assert len(BACKFILL_SYNC_HANDLERS) == 10
