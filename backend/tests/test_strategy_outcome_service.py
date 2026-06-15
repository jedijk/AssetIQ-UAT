"""Tests for strategy outcome effectiveness service (Phase 5)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services.strategy_outcome_service import compute_strategy_outcome


@pytest.mark.asyncio
async def test_strategy_outcome_not_found():
    with patch("services.strategy_outcome_service.db") as mock_db:
        mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=None)
        with pytest.raises(HTTPException) as exc:
            await compute_strategy_outcome("missing-type", {"id": "u-1"})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_strategy_outcome_computes_metrics():
    strategy = {
        "equipment_type_id": "et-pump",
        "name": "Centrifugal Pump Strategy",
        "status": "active",
        "version": 3,
    }
    actions = [
        {
            "id": "a-1",
            "status": "completed",
            "completed_at": datetime(2026, 2, 1, tzinfo=timezone.utc).isoformat(),
            "linked_equipment_id": "eq-1",
        }
    ]
    assessed = {
        "action_id": "a-1",
        "status": "assessed",
        "equipment_id": "eq-1",
        "risk_reduction_pct": 30.0,
        "exposure_reduction": 800.0,
        "repeat_failure_count": 0,
        "outcome_status": "successful",
    }

    with patch("services.strategy_outcome_service.db") as mock_db, patch(
        "services.strategy_outcome_service._covered_equipment_ids",
        AsyncMock(return_value=["eq-1", "eq-2"]),
    ), patch(
        "services.strategy_outcome_service._fetch_completed_actions",
        AsyncMock(return_value=actions),
    ), patch(
        "services.strategy_outcome_service.assess_closed_action_outcome",
        AsyncMock(return_value=assessed),
    ):
        mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=strategy)
        mock_db.strategy_version_history.find = MagicMock(
            return_value=MagicMock(
                sort=MagicMock(
                    return_value=MagicMock(
                        limit=MagicMock(
                            return_value=MagicMock(to_list=AsyncMock(return_value=[]))
                        )
                    )
                )
            )
        )

        result = await compute_strategy_outcome("et-pump", {"id": "u-1"})

    assert result["strategy_id"] == "et-pump"
    assert result["covered_equipment_count"] == 2
    assert result["actions_completed_count"] == 1
    assert result["avg_risk_reduction_pct"] == 30.0
    assert result["exposure_delta"] == 800.0
    assert result["strategy_effectiveness_score"] is not None
    assert len(result["action_outcomes"]) == 1
