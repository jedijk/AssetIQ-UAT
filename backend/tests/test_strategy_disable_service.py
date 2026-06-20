"""Service-layer disable impact and propagation for maintenance strategies."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from models.maintenance_strategy_v2 import UpdateEquipmentTypeStrategyRequest
from services.maintenance_strategy_v2_service import (
    get_strategy_disable_impact,
    update_equipment_type_strategy,
)


@pytest.mark.asyncio
async def test_get_strategy_disable_impact():
    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(
        return_value={"equipment_type_id": "etype-1"}
    )

    with patch("services.maintenance_strategy_v2_service.db", mock_db), patch(
        "services.maintenance_strategy_v2_service.count_active_programs_for_strategy",
        new=AsyncMock(return_value=2),
    ), patch(
        "services.maintenance_strategy_v2_service.count_open_scheduled_tasks_for_strategy",
        new=AsyncMock(return_value=5),
    ):
        result = await get_strategy_disable_impact("etype-1", {"user_id": "u1"})

    assert result == {
        "equipment_type_id": "etype-1",
        "active_program_count": 2,
        "open_scheduled_tasks_count": 5,
        "has_impact": True,
    }


@pytest.mark.asyncio
async def test_update_strategy_disabled_propagates():
    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(
        side_effect=[
            {"equipment_type_id": "etype-1", "version": "1.0"},
            {"equipment_type_id": "etype-1", "version": "1.1", "status": "disabled"},
        ]
    )
    mock_db.equipment_type_strategies.update_one = AsyncMock()

    with patch("services.maintenance_strategy_v2_service.db", mock_db), patch(
        "services.maintenance_strategy_v2_service._deactivate_all_programs_for_strategy",
        new=AsyncMock(return_value=4),
    ), patch(
        "services.maintenance_strategy_v2_service._cancel_open_scheduled_tasks_for_strategy",
        new=AsyncMock(return_value=7),
    ), patch(
        "services.maintenance_strategy_v2_service.clear_strategy_needs_apply",
        new=AsyncMock(),
    ) as mock_clear:
        result = await update_equipment_type_strategy(
            "etype-1",
            UpdateEquipmentTypeStrategyRequest(status="disabled"),
            {"user_id": "u1"},
        )

    assert result["programs_deactivated"] == 4
    assert result["scheduled_tasks_cancelled"] == 7
    assert result["strategy_needs_apply"] is False
    mock_clear.assert_awaited_once()
