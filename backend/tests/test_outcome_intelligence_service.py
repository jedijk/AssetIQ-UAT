"""Tests for fleet outcome intelligence service (Phase 5)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.outcome_intelligence_service import compute_fleet_outcome_summary
from services.outcome_metrics import action_effectiveness_score


def test_action_effectiveness_score_composite():
    score = action_effectiveness_score(
        assessed_count=4,
        successful_count=3,
        avg_risk_reduction_pct=20.0,
    )
    assert score is not None
    assert 0 <= score <= 100


@pytest.mark.asyncio
async def test_fleet_outcome_summary_empty_scope():
    with patch(
        "services.outcome_intelligence_service.compute_fleet_reliability_summary",
        AsyncMock(return_value={"open_threats": 0, "canonical_source": "equipment_reliability_state"}),
    ), patch(
        "services.outcome_intelligence_service._scoped_equipment_ids",
        AsyncMock(return_value=[]),
    ), patch(
        "services.outcome_intelligence_service._fetch_completed_actions",
        AsyncMock(return_value=[]),
    ), patch(
        "services.outcome_intelligence_service.db",
    ) as mock_db:
        mock_db.maintenance_programs_v2.count_documents = AsyncMock(return_value=0)
        result = await compute_fleet_outcome_summary({"id": "u-1"})

    assert result["completed_actions_count"] == 0
    assert result["assessed_actions_count"] == 0
    assert result["window_days"] == 90
    assert "canonical_fleet_state" in result


@pytest.mark.asyncio
async def test_fleet_outcome_summary_aggregates_assessments():
    closure = datetime(2026, 2, 1, tzinfo=timezone.utc)
    actions = [
        {
            "id": "a-1",
            "status": "completed",
            "completed_at": closure.isoformat(),
            "linked_equipment_id": "eq-1",
        }
    ]
    assessed = {
        "action_id": "a-1",
        "status": "assessed",
        "equipment_id": "eq-1",
        "risk_reduction_pct": 25.0,
        "exposure_reduction": 1200.0,
        "repeat_failure_count": 0,
        "outcome_status": "successful",
        "currency": "EUR",
    }

    with patch(
        "services.outcome_intelligence_service.compute_fleet_reliability_summary",
        AsyncMock(return_value={"open_threats": 2}),
    ), patch(
        "services.outcome_intelligence_service._scoped_equipment_ids",
        AsyncMock(return_value=["eq-1"]),
    ), patch(
        "services.outcome_intelligence_service._fetch_completed_actions",
        AsyncMock(return_value=actions),
    ), patch(
        "services.outcome_intelligence_service.assess_closed_action_outcome",
        AsyncMock(return_value=assessed),
    ), patch(
        "services.outcome_intelligence_service.db",
    ) as mock_db:
        mock_db.maintenance_programs_v2.count_documents = AsyncMock(return_value=1)
        mock_db.maintenance_programs_v2.distinct = AsyncMock(return_value=["eq-1"])
        result = await compute_fleet_outcome_summary({"id": "u-1"})

    assert result["completed_actions_count"] == 1
    assert result["assessed_actions_count"] == 1
    assert result["avg_risk_reduction_pct"] == 25.0
    assert result["total_exposure_reduction"] == 1200.0
    assert result["reliability_roi"] == 1200.0
    assert result["action_effectiveness_score"] is not None
