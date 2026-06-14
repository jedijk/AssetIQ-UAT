"""Tests for equipment reliability profile composition."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.equipment_reliability_profile_service import (
    _exposure_rank_score,
    _failure_mode_stats,
    _strategy_coverage,
    build_equipment_reliability_profile,
)


def test_exposure_rank_score_weights_risk_and_rpn():
    score = _exposure_rank_score(
        {"risk_score": 80, "fmea_rpn": 200},
        production_impact=4,
    )
    assert score > 80


def test_failure_mode_stats_from_threats():
    stats = _failure_mode_stats(
        [
            {"failure_mode": "Leak", "risk_score": 60, "fmea_rpn": 100},
            {"failure_mode": "Leak", "risk_score": 40},
            {"failure_mode": "Wear", "risk_score": 90, "fmea_rpn": 50},
        ],
        [],
    )
    assert stats["most_frequent"][0]["failure_mode"] == "Leak"
    assert stats["most_frequent"][0]["count"] == 2
    assert stats["most_severe"][0]["failure_mode"] == "Wear"


def test_strategy_coverage_splits_modes():
    modes = [
        {"failure_mode_id": "fm-1", "failure_mode_name": "Leak"},
        {"failure_mode_id": "fm-2", "failure_mode_name": "Wear"},
    ]
    tasks = [{"traceability": {"failure_mode_id": "fm-1"}}]
    edges = [{"relation": "has_failure_mode", "target_type": "failure_mode", "target_id": "fm-2"}]
    coverage = _strategy_coverage(modes, tasks, edges)
    assert coverage["covered_count"] == 2
    assert coverage["not_covered_count"] == 0


@pytest.mark.asyncio
async def test_build_profile_not_found():
    with patch(
        "services.equipment_reliability_profile_service.ReliabilityContextService",
    ) as mock_cls:
        mock_cls.return_value.get_context = AsyncMock(return_value={"found": False, "equipment_id": "eq-1"})
        result = await build_equipment_reliability_profile("eq-1", "user-1")
    assert result["found"] is False


@pytest.mark.asyncio
async def test_build_profile_summary_fields():
    ctx = {
        "found": True,
        "equipment_id": "eq-1",
        "equipment": {
            "id": "eq-1",
            "name": "Pump P-101",
            "criticality": {"level": "production_critical", "production_impact": 4},
        },
        "failure_modes": [{"failure_mode_id": "fm-1", "failure_mode_name": "Leak"}],
        "open_threat_count": 1,
        "open_threats": [{"id": "th-1", "title": "Leak", "risk_score": 70, "risk_level": "High"}],
        "program_task_count": 3,
        "strategy_version": "v2",
        "graph": {"edges": []},
        "twin_snapshot": {
            "latest": {
                "health_score": 75,
                "open_threat_count": 1,
                "overdue_pm_count": 0,
                "snapshot_at": "2026-05-01T00:00:00+00:00",
            },
            "delta": None,
        },
    }
    health_doc = {
        "reliability_score": 75,
        "open_threats": 1,
        "overdue_pm": {"total": 0},
        "snapshot_date": "2026-05-19",
    }

    with patch(
        "services.equipment_reliability_profile_service.ReliabilityContextService",
    ) as mock_ctx_cls, patch(
        "services.equipment_reliability_profile_service.GraphTraversalService",
    ) as mock_graph_cls, patch(
        "services.equipment_reliability_profile_service.compute_equipment_snapshot",
        AsyncMock(return_value=health_doc),
    ), patch(
        "services.equipment_reliability_profile_service._fetch_open_threats_ranked",
        AsyncMock(return_value=[{"id": "th-1", "title": "Leak", "risk_score": 70, "risk_level": "High", "exposure_rank_score": 80}]),
    ), patch(
        "services.equipment_reliability_profile_service._fetch_investigations",
        AsyncMock(return_value={"items": [], "open": [], "open_count": 0, "recent_count": 0}),
    ), patch(
        "services.equipment_reliability_profile_service._fetch_actions",
        AsyncMock(return_value={"items": [], "open": [], "completed": [], "open_count": 0, "completed_count": 0, "effectiveness_note": "none"}),
    ), patch(
        "services.equipment_reliability_profile_service._build_reliability_trend",
        AsyncMock(return_value={"current": {"health_score": 75}, "windows": {}, "series": []}),
    ), patch(
        "services.equipment_reliability_profile_service.db",
    ) as mock_db:
        mock_ctx_cls.return_value.get_context = AsyncMock(return_value=ctx)
        mock_graph_cls.return_value.explain_risk = AsyncMock(return_value={"open_threat_count": 1})
        mock_db.maintenance_programs_v2.find_one = AsyncMock(return_value={"tasks": []})

        result = await build_equipment_reliability_profile("eq-1", "user-1", user={"id": "user-1"})

    assert result["found"] is True
    assert result["summary"]["name"] == "Pump P-101"
    assert result["summary"]["health_score"] == 75
    assert result["ai_reliability_summary"]
    assert len(result["open_threats"]) == 1
