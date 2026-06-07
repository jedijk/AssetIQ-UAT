"""Tests for reliability ontology payload."""
import os
from unittest.mock import AsyncMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.reliability_ontology import (
    NODE_TYPES,
    RELATIONS,
    get_reliability_ontology_payload,
)


@pytest.mark.asyncio
async def test_get_reliability_ontology_payload_includes_schema_and_counts():
    with patch(
        "services.reliability_graph_query.count_edges_by_relation",
        AsyncMock(return_value={"has_program": 12, "derived_from": 4, "legacy_edge": 3}),
    ):
        payload = await get_reliability_ontology_payload({"tenant_id": "t1"})

    assert len(payload["node_types"]) == len(NODE_TYPES)
    assert len(payload["relations"]) == len(RELATIONS)
    assert payload["reliability_edges_total"] == 19
    assert payload["edges_by_relation"]["has_program"] == 12
    assert payload["other_relations"] == [{"id": "legacy_edge", "edge_count": 3}]
    has_program = next(r for r in payload["relations"] if r["id"] == "has_program")
    assert has_program["edge_count"] == 12
