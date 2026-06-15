"""Tests for equipment reliability state projection."""
import pytest
from unittest.mock import AsyncMock, patch

from services.equipment_reliability_state_service import (
    CANONICAL_SOURCE,
    _compute_exposure_score,
    _graph_fingerprint,
    build_equipment_reliability_state,
    compute_fleet_reliability_summary,
)


def test_graph_fingerprint_stable():
    edges = [{"id": "e2"}, {"id": "e1"}]
    assert _graph_fingerprint(edges) == _graph_fingerprint(list(reversed(edges)))


def test_exposure_score_increases_with_open_signals():
    low = _compute_exposure_score(open_count=0, health_score=90, overdue_pm=0)
    high = _compute_exposure_score(open_count=3, health_score=45, overdue_pm=2, max_threat_risk=70)
    assert high > low


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
        "open_threats": [{"risk_score": 80}],
        "open_threat_count": 1,
        "program_task_count": 4,
        "strategy_version": "v2",
        "failure_modes": [{"id": "fm-1"}],
        "twin_snapshot": {"latest": {"health_score": 65, "overdue_pm_count": 1}},
    }
    with patch(
        "services.equipment_reliability_state_service.ReliabilityContextService",
    ) as mock_cls, patch(
        "services.equipment_reliability_state_service.compute_equipment_snapshot",
        AsyncMock(return_value={"reliability_score": 65, "overdue_pm": {"total": 1}}),
    ), patch(
        "services.threat_observation_bridge.count_unified_open_signals_for_equipment",
        AsyncMock(return_value=2),
    ):
        mock_cls.return_value.get_context = AsyncMock(return_value=ctx)
        result = await build_equipment_reliability_state("eq-1", "user-1")

    assert result["found"] is True
    assert result["canonical_source"] == CANONICAL_SOURCE
    assert result["open_observation_count"] == 2
    assert result["health"]["score"] == 65
    assert result["maintenance"]["overdue_count"] == 1
    assert result["exposure"]["score"] >= 55
    assert result["graph_fingerprint"]


@pytest.mark.asyncio
async def test_fleet_summary_uses_unified_open_count():
    with patch(
        "services.threat_observation_bridge.count_unified_open_signals",
        AsyncMock(return_value=7),
    ), patch(
        "services.equipment_reliability_state_service.db",
    ) as mock_db:
        mock_db.threats.count_documents = AsyncMock(return_value=2)
        mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=1)
        mock_db.task_instances.count_documents = AsyncMock(return_value=1)
        result = await compute_fleet_reliability_summary(user=None)

    assert result["unified_open_signals"] == 7
    assert result["open_observation_count"] == 7
    assert result["open_threats"] == 7
    assert result["overdue_pm"]["total"] == 2
