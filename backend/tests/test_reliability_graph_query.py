"""Tests for reliability graph query helpers."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.reliability_graph_query import get_equipment_reliability_context


@pytest.mark.asyncio
async def test_get_equipment_reliability_context():
    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(
        return_value={"id": "eq-1", "name": "Pump A", "equipment_type_id": "et-1"}
    )
    mock_db.maintenance_programs_v2.find_one = AsyncMock(
        return_value={"id": "prog-1", "source_strategy_version": "v3", "tasks": [{}, {}]}
    )

    with patch("services.reliability_graph_query.db", mock_db), patch(
        "services.reliability_graph_query.get_edges_for_equipment",
        AsyncMock(return_value=[{"relation": "has_program"}]),
    ):
        ctx = await get_equipment_reliability_context("eq-1")

    assert ctx["equipment_id"] == "eq-1"
    assert ctx["program_task_count"] == 2
    assert ctx["strategy_version"] == "v3"
    assert ctx["edge_count"] == 1
