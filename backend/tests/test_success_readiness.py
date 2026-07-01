"""Tests for Success Readiness KPI engine and dashboard."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.success_readiness_kpi_engine import (
    _calc_core_data_readiness,
    _calc_user_adoption,
    build_kpi_results,
    overall_score,
    pillar_score,
)
from services.success_readiness_models import status_from_score


def test_status_from_score():
    assert status_from_score(85, 80) == "on_track"
    assert status_from_score(70, 80) == "at_risk"
    assert status_from_score(40, 80) == "off_track"
    assert status_from_score(None, 80) == "not_started"


@pytest.mark.asyncio
async def test_calc_user_adoption():
    mock_db = MagicMock()
    mock_db.users.count_documents = AsyncMock(return_value=10)

    with patch("services.success_readiness_kpi_engine._user_stats") as mock_stats:
        mock_stats.build_event_match_stage = MagicMock(return_value={})
        mock_stats._get_kpi_metrics = AsyncMock(return_value={"active_users": 8})
        mock_stats.users = mock_db.users
        mock_stats.stats_users_query = MagicMock(return_value={})

        score, detail = await _calc_user_adoption()

    assert score == 80
    assert detail["active_users"] == 8
    assert detail["total_users"] == 10


@pytest.mark.asyncio
async def test_calc_core_data_readiness():
    user = {"role": "admin", "company_id": "tenant-1"}
    mock_db = MagicMock()
    mock_db.equipment_nodes.count_documents = AsyncMock(side_effect=[2, 20, 15, 10])

    with patch("services.success_readiness_kpi_engine.db", mock_db):
        score, detail = await _calc_core_data_readiness(user)

    assert score > 0
    assert detail["sites"] == 2
    assert detail["equipment_count"] == 20


@pytest.mark.asyncio
async def test_build_kpi_results_includes_auto_kpis():
    user = {"role": "admin"}
    mock_db = MagicMock()
    mock_db.success_readiness_evidence.count_documents = AsyncMock(return_value=0)
    mock_db.success_readiness_registers.count_documents = AsyncMock(return_value=0)
    mock_db.success_readiness_registers.aggregate = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )
    mock_db.equipment_nodes.count_documents = AsyncMock(side_effect=[1, 5, 4, 3])
    mock_db.users.count_documents = AsyncMock(return_value=4)

    with patch("services.success_readiness_kpi_engine.db", mock_db), patch(
        "services.success_readiness_kpi_engine._user_stats"
    ) as mock_stats:
        mock_stats.build_event_match_stage = MagicMock(return_value={})
        mock_stats._get_kpi_metrics = AsyncMock(return_value={"active_users": 3})
        mock_stats.users = mock_db.users
        mock_stats.stats_users_query = MagicMock(return_value={})

        kpis = await build_kpi_results(user, None)

    assert len(kpis) == 15
    adoption = next(k for k in kpis if k["id"] == "user_adoption")
    data_ready = next(k for k in kpis if k["id"] == "core_data_readiness")
    assert adoption["score"] is not None
    assert data_ready["score"] is not None
    assert overall_score(kpis) is not None
    assert pillar_score(kpis, "people") is not None
