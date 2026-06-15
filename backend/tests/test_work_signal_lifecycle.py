"""Convergence Phase 3 — canonical work signal lifecycle."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.work_signal_lifecycle import (
    LIFECYCLE_STAGES,
    create_work_signal,
    observation_to_threat_projection,
)


def test_lifecycle_stages_order():
    assert LIFECYCLE_STAGES[0] == "observation"
    assert LIFECYCLE_STAGES[-1] == "outcome"


def test_observation_to_threat_projection_maps_fields():
    obs = {
        "id": "sig-1",
        "description": "Seal leak on pump",
        "status": "open",
        "equipment_id": "eq-1",
        "equipment_name": "Pump",
        "risk_level": "high",
        "risk_score": 70,
        "source": "task_execution",
    }
    threat = observation_to_threat_projection(obs, user={"company_id": "co-1"})
    assert threat["id"] == "sig-1"
    assert threat["projection_of"] == "observation"
    assert threat["linked_equipment_id"] == "eq-1"
    assert threat["tenant_id"] == "co-1"


@pytest.mark.asyncio
async def test_create_work_signal_writes_observation_then_threat():
    mock_db = MagicMock()
    mock_db.observations = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.observations.insert_one = AsyncMock()
    mock_db.threats.insert_one = AsyncMock()

    graph_sync = AsyncMock()
    publish = AsyncMock()

    signal_doc = {
        "id": "sig-99",
        "title": "Vibration",
        "description": "High vibration",
        "status": "Open",
        "linked_equipment_id": "eq-2",
        "asset": "Compressor",
        "risk_score": 55,
        "created_by": "user-1",
    }

    with patch("services.work_signal_lifecycle.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync",
        graph_sync,
    ), patch(
        "services.event_outbox.publish_event",
        publish,
    ):
        result = await create_work_signal(
            signal_doc,
            user={"company_id": "co-1", "id": "user-1"},
            source="test",
            graph_label="test_create",
        )

    assert result["id"] == "sig-99"
    mock_db.observations.insert_one.assert_called_once()
    mock_db.threats.insert_one.assert_called_once()
    obs = mock_db.observations.insert_one.call_args[0][0]
    threat = mock_db.threats.insert_one.call_args[0][0]
    assert obs["id"] == "sig-99"
    assert obs.get("legacy_threat_id") is None
    assert threat["id"] == "sig-99"
    assert threat["projection_of"] == "observation"
    assert graph_sync.await_count == 2
    publish.assert_called_once()
