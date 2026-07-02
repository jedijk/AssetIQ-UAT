"""Tests for Success Readiness KPI engine and dashboard."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.success_readiness_kpi_engine import (
    _calc_core_data_readiness,
    _calc_user_adoption,
    _user_adoption_score,
    build_kpi_results,
    overall_score,
    pillar_score,
)
from services.success_readiness_models import status_from_score
from services.success_readiness_register_scoring import (
    derive_register_completion_pct,
    score_training_registers,
)


def test_status_from_score():
    assert status_from_score(85, 80) == "on_track"
    assert status_from_score(70, 80) == "at_risk"
    assert status_from_score(40, 80) == "off_track"
    assert status_from_score(None, 80) == "not_started"


def test_derive_register_completion_pct_training_completed():
    pct = derive_register_completion_pct(
        "training",
        {"status": "completed", "metadata": {"expires_at": "2099-01-01T00:00:00+00:00"}},
    )
    assert pct == 100


def test_score_training_registers():
    score, detail = score_training_registers([
        {"status": "completed", "metadata": {}},
        {"status": "pending", "metadata": {}},
    ])
    assert score == 50
    assert detail["completed"] == 1


def test_user_adoption_score():
    assert _user_adoption_score(0, 0) == 0
    assert _user_adoption_score(0, 5) == 0
    assert _user_adoption_score(5, 8) == 50
    assert _user_adoption_score(8, 8) == 90
    assert _user_adoption_score(8, 5) == 100
    assert _user_adoption_score(3, 0) == 100


@pytest.mark.asyncio
async def test_calc_user_adoption():
    with patch("services.success_readiness_kpi_engine._user_stats") as mock_stats:
        mock_stats.build_event_match_stage = MagicMock(return_value={})
        mock_stats._get_kpi_metrics = AsyncMock(
            side_effect=[
                {"active_users": 8, "total_sessions": 12},
                {"active_users": 5, "total_sessions": 9},
            ]
        )

        score, detail = await _calc_user_adoption({"role": "admin", "company_id": "t1"})

    assert score == 100
    assert detail["active_users"] == 8
    assert detail["previous_active_users"] == 5
    assert detail["comparison"] == "growth"


@pytest.mark.asyncio
async def test_calc_core_data_readiness():
    user = {"role": "admin", "company_id": "tenant-1"}
    mock_db = MagicMock()
    mock_db.equipment_nodes.count_documents = AsyncMock(side_effect=[2, 20, 15])
    mock_db.equipment_nodes.find = MagicMock(
        return_value=MagicMock(
            to_list=AsyncMock(
                return_value=[
                    {"level": "subunit", "criticality": {"level": "production_critical"}},
                    {"level": "subunit", "criticality": None},
                    {"level": "maintainable_item", "criticality": {"production_impact": 3}},
                    {"level": "maintainable_item", "criticality": None},
                    {"level": "maintainable_item", "criticality": None},
                ]
            )
        )
    )

    with patch("services.success_readiness_kpi_engine.db", mock_db):
        score, detail = await _calc_core_data_readiness(user)

    assert score > 0
    assert detail["sites"] == 2
    assert detail["equipment_count"] == 20
    assert detail["criticality_scope_total"] == 5
    assert detail["criticality_assessed"] == 2
    assert detail["criticality_coverage_percent"] == 40


def _mock_async_cursor(items=None):
    items = items or []

    class _Cursor:
        def limit(self, _n):
            return self

        def __aiter__(self):
            self._iter = iter(items)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration as exc:
                raise StopAsyncIteration from exc

    return _Cursor()


def _mock_db_for_build_kpi():
    mock_db = MagicMock()
    mock_db.success_readiness_evidence.count_documents = AsyncMock(return_value=0)
    mock_db.success_readiness_registers.find = MagicMock(return_value=_mock_async_cursor())
    mock_db.success_readiness_assessments.find_one = AsyncMock(return_value=None)
    mock_db.equipment_nodes.count_documents = AsyncMock(side_effect=[1, 5, 4, 5, 5, 0, 0])
    mock_db.equipment_nodes.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )
    mock_db.users.count_documents = AsyncMock(return_value=4)
    mock_db.threats.count_documents = AsyncMock(return_value=0)
    mock_db.central_actions.count_documents = AsyncMock(return_value=0)
    mock_db.failure_modes.count_documents = AsyncMock(return_value=0)
    mock_db.maintenance_strategies.count_documents = AsyncMock(return_value=0)
    mock_db.ai_usage.count_documents = AsyncMock(return_value=0)
    mock_db.ai_usage.distinct = AsyncMock(return_value=[])
    mock_db.external_api_keys.count_documents = AsyncMock(return_value=0)
    mock_db.success_readiness_config.find_one = AsyncMock(return_value=None)
    return mock_db


@pytest.mark.asyncio
async def test_integration_health_excluded_when_integrations_disabled():
    user = {"role": "owner", "company_id": "t1"}
    mock_db = _mock_db_for_build_kpi()
    mock_db.success_readiness_config.find_one = AsyncMock(return_value={"integrations_enabled": False})

    with patch("services.success_readiness_kpi_engine.db", mock_db), patch(
        "services.success_readiness_kpi_engine._user_stats"
    ) as mock_stats:
        mock_stats.build_event_match_stage = MagicMock(return_value={})
        mock_stats._get_kpi_metrics = AsyncMock(
            side_effect=[
                {"active_users": 3, "total_sessions": 4},
                {"active_users": 2, "total_sessions": 2},
                {"active_users": 3, "total_sessions": 4},
                {"active_users": 0, "total_sessions": 0},
            ]
        )
        mock_stats._get_module_usage = AsyncMock(return_value=[])
        mock_stats._get_device_usage = AsyncMock(return_value={"breakdown": {"mobile": {"percentage": 0}}})
        mock_stats.users = mock_db.users
        mock_stats.stats_users_query = MagicMock(return_value={})

        kpis = await build_kpi_results(user, "t1")

    integration = next(k for k in kpis if k["id"] == "integration_health")
    assert integration["excluded"] is True
    assert integration["status"] == "excluded"
    assert integration["score"] is None
    mock_db.external_api_keys.count_documents.assert_not_called()


@pytest.mark.asyncio
async def test_build_kpi_results_includes_auto_kpis():
    user = {"role": "admin", "company_id": "t1"}
    mock_db = _mock_db_for_build_kpi()

    with patch("services.success_readiness_kpi_engine.db", mock_db), patch(
        "services.success_readiness_kpi_engine._user_stats"
    ) as mock_stats:
        mock_stats.build_event_match_stage = MagicMock(return_value={})
        mock_stats._get_kpi_metrics = AsyncMock(
            side_effect=[
                {"active_users": 3, "total_sessions": 4},
                {"active_users": 2, "total_sessions": 2},
                {"active_users": 3, "total_sessions": 4},
                {"active_users": 0, "total_sessions": 0},
            ]
        )
        mock_stats._get_module_usage = AsyncMock(return_value=[])
        mock_stats._get_device_usage = AsyncMock(return_value={"breakdown": {"mobile": {"percentage": 0}}})
        mock_stats.users = mock_db.users
        mock_stats.stats_users_query = MagicMock(return_value={})

        kpis = await build_kpi_results(user, "t1")

    assert len(kpis) == 15
    adoption = next(k for k in kpis if k["id"] == "user_adoption")
    data_ready = next(k for k in kpis if k["id"] == "core_data_readiness")
    assert adoption["score"] is not None
    assert data_ready["score"] is not None
    assert overall_score(kpis) is not None
    assert pillar_score(kpis, "people") is not None
