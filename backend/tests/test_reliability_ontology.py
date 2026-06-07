"""Tests for reliability ontology payload."""
from unittest.mock import AsyncMock, patch

import pytest

from services.reliability_ontology import (
    NODE_TYPES,
    RELATIONS,
    get_reliability_ontology_payload,
)


@pytest.mark.asyncio
async def test_get_reliability_ontology_payload_includes_schema_and_counts():
    with patch(
        "services.reliability_graph_query.count_edges_by_relation",
        AsyncMock(return_value={"has_program": 12, "derived_from": 4}),
    ):
        payload = await get_reliability_ontology_payload({"tenant_id": "t1"})

    assert len(payload["node_types"]) == len(NODE_TYPES)
    assert len(payload["relations"]) == len(RELATIONS)
    assert payload["reliability_edges_total"] == 16
    assert payload["edges_by_relation"]["has_program"] == 12
    has_program = next(r for r in payload["relations"] if r["id"] == "has_program")
    assert has_program["edge_count"] == 12
