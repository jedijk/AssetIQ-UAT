"""Tests for equipment reliability state projection."""
import pytest
from unittest.mock import AsyncMock, patch

from services.equipment_reliability_state_service import (
    _graph_fingerprint,
    build_equipment_reliability_state,
)


def test_graph_fingerprint_stable():
    edges = [{"id": "e2"}, {"id": "e1"}]
    assert _graph_fingerprint(edges) == _graph_fingerprint(list(reversed(edges)))


@pytest.mark.asyncio
async def test_build_state_not_found():
    with patch(
        "services.equipment_reliability_state_service.ReliabilityContextService",
    ) as mock_cls:
        mock_cls.return_value.get_context = AsyncMock(return_value={"found": False})
        result = await build_equipment_reliability_state("eq-1", "user-1")
    assert result["found"] is False


@pytest.mark.asyncio
async def test_build_state_aggregates_signals():
    ctx = {
        "found": True,
        "equipment": {"id": "eq-1", "name": "Pump"},
        "graph": {"edges": [{"id": "edge-1", "status": "active"}]},
        "open_threat_count": 2,
        "program_task_count": 4,
        "strategy_version": "v2",
        "twin_snapshot": {"latest": {"health_score": 65, "overdue_pm_count": 1}},
    }
    with patch(
        "services.equipment_reliability_state_service.ReliabilityContextService",
    ) as mock_cls, patch(
        "services.equipment_reliability_state_service.compute_equipment_snapshot",
        AsyncMock(return_value={"reliability_score": 65, "overdue_pm": {"total": 1}}),
    ), patch(
        "services.equipment_reliability_state_service.db",
    ) as mock_db:
        mock_db.threats.count_documents = AsyncMock(return_value=2)
        mock_cls.return_value.get_context = AsyncMock(return_value=ctx)
        result = await build_equipment_reliability_state("eq-1", "user-1")

    assert result["found"] is True
    assert result["open_observation_count"] == 2
    assert result["overdue_pm_count"] == 1
    assert result["graph_fingerprint"]
    assert result["signals"]["open_observations"] is True
