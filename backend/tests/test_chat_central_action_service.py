"""Tests for chat auto-created central_actions."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.chat_central_action_service import (
    _normalize_action_type,
    _normalize_priority,
    create_chat_central_action,
)


def test_normalize_action_type_maps_pm_cm():
    assert _normalize_action_type("PM") == "preventive"
    assert _normalize_action_type("CM") == "corrective"
    assert _normalize_action_type("unknown") == "corrective"


def test_normalize_priority_lowercases():
    assert _normalize_priority("High") == "high"
    assert _normalize_priority(None) == "medium"


@pytest.mark.asyncio
async def test_create_chat_central_action_inserts_central_actions():
    mock_db = MagicMock()
    mock_db.central_actions.count_documents = AsyncMock(return_value=2)
    mock_db.action_counters.update_one = AsyncMock()
    mock_db.action_counters.find_one_and_update = AsyncMock(
        return_value={"seq": 3}
    )
    mock_db.central_actions.insert_one = AsyncMock()

    with patch("services.chat_central_action_service.db", mock_db), patch(
        "services.chat_central_action_service.allocate_central_action_number",
        new_callable=AsyncMock,
        return_value="ACT-0003",
    ), patch(
        "services.reliability_graph._run_graph_sync", new_callable=AsyncMock
    ), patch(
        "services.reliability_graph.sync_action_edges", return_value=MagicMock()
    ):
        doc = await create_chat_central_action(
            user_id="user-1",
            threat_id="threat-1",
            threat_title="Pump - Seal leak",
            title="Replace seal",
            description="Replace mechanical seal",
            action_type="CM",
            discipline="Mechanical",
            priority="high",
            linked_equipment_id="eq-1",
            equipment_name="Pump A",
            auto_source="failure_mode",
        )

    assert doc["id"]
    assert doc["action_number"] == "ACT-0003"
    assert doc["source_type"] == "threat"
    assert doc["source_id"] == "threat-1"
    assert doc["status"] == "open"
    assert doc["action_type"] == "corrective"
    assert doc["auto_created_from_failure_mode"] is True
    mock_db.central_actions.insert_one.assert_awaited_once()
