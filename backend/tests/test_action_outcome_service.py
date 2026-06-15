"""Tests for action outcome service (Phase 3)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services.action_outcome_service import (
    _compute_outcome_status,
    get_action_outcome,
)


def test_compute_outcome_status_successful():
    before = {"risk_score_total": 100, "threat_count": 2, "exposure_proxy": 1000}
    after = {"risk_score_total": 50, "threat_count": 1, "exposure_proxy": 500}
    status, pct, exposure_delta = _compute_outcome_status(before, after, repeat_count=0)
    assert status == "successful"
    assert pct == 50.0
    assert exposure_delta == 500.0


def test_compute_outcome_status_unsuccessful_on_repeats():
    before = {"risk_score_total": 80, "threat_count": 1, "exposure_proxy": 800}
    after = {"risk_score_total": 70, "threat_count": 2, "exposure_proxy": 700}
    status, _, _ = _compute_outcome_status(before, after, repeat_count=2)
    assert status == "unsuccessful"


def test_compute_outcome_status_neutral():
    before = {"risk_score_total": 60, "threat_count": 1, "exposure_proxy": 600}
    after = {"risk_score_total": 55, "threat_count": 1, "exposure_proxy": 550}
    status, pct, _ = _compute_outcome_status(before, after, repeat_count=0)
    assert status == "neutral"
    assert pct == pytest.approx(8.33, rel=0.1)


@pytest.mark.asyncio
async def test_get_action_outcome_pending_for_open_action():
    with patch(
        "services.action_outcome_service.find_central_action",
        AsyncMock(return_value={"id": "a-1", "status": "open"}),
    ), patch(
        "services.action_outcome_service.assert_action_installation_scope",
        AsyncMock(),
    ):
        result = await get_action_outcome("a-1", {"id": "u-1"})
    assert result["status"] == "pending"
    assert "completed" in result["message"].lower()


@pytest.mark.asyncio
async def test_get_action_outcome_assessed_for_completed_action():
    closure = datetime(2026, 3, 1, tzinfo=timezone.utc)
    action = {
        "id": "a-1",
        "status": "completed",
        "completed_at": closure.isoformat(),
        "linked_equipment_id": "eq-1",
        "source_type": "threat",
        "threat_id": "t-1",
    }
    mock_db = MagicMock()
    mock_db.production_loss_config.find_one = AsyncMock(
        return_value={"hourly_cost": 500.0, "currency": "EUR"}
    )
    mock_db.equipment_nodes.find_one = AsyncMock(
        return_value={"id": "eq-1", "name": "Pump A", "criticality": {"production_impact": 3}}
    )
    mock_db.outcomes.find_one = AsyncMock(return_value=None)
    mock_db.threats.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )

    with patch(
        "services.action_outcome_service.find_central_action",
        AsyncMock(return_value=action),
    ), patch(
        "services.action_outcome_service.assert_action_installation_scope",
        AsyncMock(),
    ), patch(
        "services.action_outcome_service._threat_repo.find_one",
        AsyncMock(return_value={"failure_mode": "Bearing wear", "failure_mode_id": "fm-1"}),
    ), patch("services.action_outcome_service.db", mock_db):
        result = await get_action_outcome("a-1", {"id": "u-1"})

    assert result["status"] == "assessed"
    assert result["equipment_id"] == "eq-1"
    assert result["outcome_status"] in {"successful", "neutral", "unsuccessful"}
    assert "90" in result["windows"]
    assert result["exposure_label"].startswith("Exposure reduction")


@pytest.mark.asyncio
async def test_get_action_outcome_not_found():
    with patch(
        "services.action_outcome_service.find_central_action",
        AsyncMock(return_value=None),
    ):
        with pytest.raises(HTTPException) as exc:
            await get_action_outcome("missing", {"id": "u-1"})
    assert exc.value.status_code == 404
