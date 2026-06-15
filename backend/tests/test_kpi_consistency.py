"""Convergence 1 — KPI registry and consistency stubs."""
from unittest.mock import AsyncMock, patch

import pytest

from services.kpi_ownership_registry import (
    CANONICAL_PROJECTION,
    KPI_REGISTRY,
    canonical_field,
    list_kpis,
)


def test_kpi_registry_has_canonical_projection():
    assert CANONICAL_PROJECTION == "equipment_reliability_state"
    assert len(KPI_REGISTRY) >= 5


def test_each_kpi_has_canonical_field_and_owner():
    state_owned = {
        "health_score",
        "open_signals_count",
        "exposure",
        "risk_level",
        "graph_fingerprint",
        "pm_overdue",
        "strategy_coverage",
    }
    for name in list_kpis():
        entry = KPI_REGISTRY[name]
        assert entry.get("canonical_field")
        assert entry.get("owner_service")
        if name in state_owned:
            assert entry.get("owner_service") == "equipment_reliability_state_service"


def test_canonical_field_lookup():
    assert canonical_field("health_score") == "health.score"
    assert canonical_field("open_signals_count") == "open_observation_count"
    assert canonical_field("action_effectiveness_score") == "action_effectiveness_score"
    assert canonical_field("reliability_roi") == "total_exposure_reduction"


def test_outcome_kpis_have_phase5_owners():
    assert KPI_REGISTRY["action_effectiveness_score"]["owner_service"] == "outcome_intelligence_service"
    assert KPI_REGISTRY["strategy_effectiveness_score"]["owner_service"] == "strategy_outcome_service"
    assert KPI_REGISTRY["reliability_roi"]["owner_service"] == "outcome_intelligence_service"


@pytest.mark.asyncio
async def test_profile_summary_aligns_with_reliability_state():
    state = {
        "found": True,
        "canonical_source": "equipment_reliability_state",
        "health": {"score": 72},
        "health_score": 72,
        "risk_level": "High",
        "open_observation_count": 3,
        "maintenance": {"overdue_count": 1},
        "exposure": {"score": 66},
        "program_task_count": 5,
        "strategy_version": "v2",
    }
    with patch(
        "services.equipment_reliability_profile_service.ReliabilityContextService",
    ) as mock_ctx, patch(
        "services.equipment_reliability_profile_service.compute_equipment_snapshot",
        AsyncMock(return_value={"reliability_score": 72, "overdue_pm": {"total": 1}}),
    ), patch(
        "services.equipment_reliability_profile_service.GraphTraversalService",
    ) as mock_graph, patch(
        "services.equipment_reliability_state_service.build_equipment_reliability_state",
        AsyncMock(return_value=state),
    ), patch(
        "services.equipment_reliability_profile_service._fetch_open_threats_ranked",
        AsyncMock(return_value=[]),
    ), patch(
        "services.equipment_reliability_profile_service._fetch_investigations",
        AsyncMock(return_value={"open_count": 0, "items": []}),
    ), patch(
        "services.equipment_reliability_profile_service._fetch_actions",
        AsyncMock(return_value={"open_count": 0, "items": []}),
    ), patch(
        "services.equipment_reliability_profile_service._build_reliability_trend",
        AsyncMock(return_value={}),
    ), patch(
        "services.equipment_reliability_profile_service.db",
    ) as mock_db:
        mock_ctx.return_value.get_context = AsyncMock(
            return_value={
                "found": True,
                "equipment": {"id": "eq-1", "name": "Pump"},
                "graph": {"edges": []},
                "failure_modes": [],
                "twin_snapshot": {},
            }
        )
        mock_graph.return_value.explain_risk = AsyncMock(return_value={})
        mock_db.maintenance_programs_v2.find_one = AsyncMock(return_value=None)

        from services.equipment_reliability_profile_service import build_equipment_reliability_profile

        profile = await build_equipment_reliability_profile("eq-1", "user-1")

    summary = profile["summary"]
    assert summary["health_score"] == state["health_score"]
    assert summary["open_observation_count"] == state["open_observation_count"]
    assert summary["risk_level"] == state["risk_level"]
    assert summary["canonical_source"] == CANONICAL_PROJECTION
