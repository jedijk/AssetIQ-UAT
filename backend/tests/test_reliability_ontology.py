"""Tests for reliability ontology payload."""
import os
from unittest.mock import AsyncMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.reliability_ontology import (
    NODE_TYPES,
    RELATIONS,
    _merge_observation_topology,
    get_reliability_ontology_payload,
)


@pytest.mark.asyncio
async def test_get_reliability_ontology_payload_includes_schema_and_counts():
    topology = {
        "edges_by_relation": {"has_program": 12, "derived_from": 4, "legacy_edge": 3},
        "relation_arcs": [
            {
                "id": "has_program:equipment:maintenance_program_v2",
                "relation": "has_program",
                "source": "equipment",
                "target": "maintenance_program_v2",
                "edge_count": 12,
            },
            {
                "id": "derived_from:scheduled_task:program_task",
                "relation": "derived_from",
                "source": "scheduled_task",
                "target": "program_task",
                "edge_count": 4,
            },
        ],
        "outgoing_by_node": {
            "equipment": {"has_program": 12},
            "scheduled_task": {"derived_from": 4},
        },
        "incoming_by_node": {
            "maintenance_program_v2": {"has_program": 12},
            "program_task": {"derived_from": 4},
        },
    }
    with patch(
        "services.reliability_graph_query.get_graph_topology_stats",
        AsyncMock(return_value=topology),
    ):
        payload = await get_reliability_ontology_payload({"tenant_id": "t1"})

    assert len(payload["node_types"]) == len(NODE_TYPES)
    assert len(payload["relations"]) == len(RELATIONS)
    assert payload["reliability_edges_total"] == 19
    assert payload["edges_by_relation"]["has_program"] == 12
    assert payload["other_relations"] == [{"id": "legacy_edge", "edge_count": 3}]
    has_program = next(r for r in payload["relations"] if r["id"] == "has_program")
    assert has_program["edge_count"] == 12

    equipment = next(n for n in payload["node_types"] if n["id"] == "equipment")
    assert equipment["edge_count_outgoing"] == 12
    assert equipment["outgoing_by_relation"]["has_program"] == 12

    assert len(payload["relation_arcs"]) == 2
    assert payload["relation_arcs"][0]["label"] == "has program"


def test_merge_observation_topology_rolls_finding_and_threat_into_observation():
    topology = {
        "edges_by_relation": {
            "linked_to_equipment": 20,
            "observed_on": 5,
            "escalated_to": 3,
        },
        "relation_arcs": [
            {
                "id": "linked_to_equipment:threat:equipment",
                "relation": "linked_to_equipment",
                "source": "threat",
                "target": "equipment",
                "edge_count": 20,
            },
            {
                "id": "observed_on:observation:equipment",
                "relation": "observed_on",
                "source": "observation",
                "target": "equipment",
                "edge_count": 5,
            },
            {
                "id": "escalated_to:observation:threat",
                "relation": "escalated_to",
                "source": "observation",
                "target": "threat",
                "edge_count": 3,
            },
        ],
        "outgoing_by_node": {
            "threat": {"linked_to_equipment": 20},
            "observation": {"observed_on": 5, "escalated_to": 3},
            "finding": {"found_on": 2},
        },
        "incoming_by_node": {
            "equipment": {"linked_to_equipment": 20, "observed_on": 5, "found_on": 2},
        },
    }

    merged = _merge_observation_topology(topology)

    assert "finding" not in merged["outgoing_by_node"]
    assert "threat" not in merged["outgoing_by_node"]
    obs_out = merged["outgoing_by_node"]["observation"]
    assert obs_out["linked_to_equipment"] == 20
    assert obs_out["observed_on"] == 5
    assert obs_out["found_on"] == 2
    assert "escalated_to" not in obs_out

    arc_ids = {arc["id"] for arc in merged["relation_arcs"]}
    assert "linked_to_equipment:observation:equipment" in arc_ids
    assert "observed_on:observation:equipment" in arc_ids
    assert "escalated_to:observation:observation" not in arc_ids


@pytest.mark.asyncio
async def test_get_reliability_ontology_payload_merges_observation_aliases():
    topology = {
        "edges_by_relation": {"linked_to_equipment": 10},
        "relation_arcs": [
            {
                "id": "linked_to_equipment:threat:equipment",
                "relation": "linked_to_equipment",
                "source": "threat",
                "target": "equipment",
                "edge_count": 10,
            },
        ],
        "outgoing_by_node": {"threat": {"linked_to_equipment": 10}},
        "incoming_by_node": {"equipment": {"linked_to_equipment": 10}},
    }
    with patch(
        "services.reliability_graph_query.get_graph_topology_stats",
        AsyncMock(return_value=topology),
    ):
        payload = await get_reliability_ontology_payload({"tenant_id": "t1"})

    observation = next(n for n in payload["node_types"] if n["id"] == "observation")
    assert observation["edge_count_outgoing"] == 10
    assert "finding" not in {n["id"] for n in payload["node_types"]}
    assert "threat" not in {n["id"] for n in payload["node_types"]}
