"""Convergence Phase 3 — canonical work signal lifecycle."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.work_signal_lifecycle import (
    LIFECYCLE_STAGES,
    create_work_signal,
    ensure_observation_for_signal,
    observation_doc_from_threat,
    observation_to_threat_projection,
    update_work_signal,
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


def test_observation_doc_from_threat_uses_same_id():
    threat = {
        "id": "sig-1",
        "title": "Leak",
        "description": "Seal leak",
        "status": "Observation",
        "linked_equipment_id": "eq-1",
        "risk_level": "high",
        "source": "manual",
    }
    doc = observation_doc_from_threat(threat, user={"company_id": "co-1"})
    assert doc["id"] == "sig-1"
    assert doc.get("legacy_threat_id") is None
    assert doc["tenant_id"] == "co-1"
    assert doc["source"] == "manual"


@pytest.mark.asyncio
async def test_ensure_observation_for_signal_returns_existing():
    mock_db = MagicMock()
    existing = {"id": "sig-1", "description": "Already there"}
    mock_db.observations = MagicMock()
    mock_db.observations.find_one = AsyncMock(return_value=existing)
    mock_db.threats = MagicMock()

    with patch("services.work_signal_lifecycle.db", mock_db):
        result = await ensure_observation_for_signal("sig-1", user={"company_id": "co-1"})

    assert result == existing
    mock_db.observations.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_ensure_observation_for_signal_creates_from_threat():
    mock_db = MagicMock()
    mock_db.observations = MagicMock()
    mock_db.observations.find_one = AsyncMock(side_effect=[None, None])
    mock_db.observations.insert_one = AsyncMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find_one = AsyncMock(
        return_value={
            "id": "sig-2",
            "title": "Vibration",
            "description": "High vibration",
            "status": "Open",
            "linked_equipment_id": "eq-2",
        }
    )

    with patch("services.work_signal_lifecycle.db", mock_db):
        result = await ensure_observation_for_signal("sig-2", user={"company_id": "co-1"})

    assert result["id"] == "sig-2"
    mock_db.observations.insert_one.assert_called_once()
    inserted = mock_db.observations.insert_one.call_args[0][0]
    assert inserted["id"] == "sig-2"
    assert inserted.get("legacy_threat_id") is None


@pytest.mark.asyncio
async def test_ensure_observation_for_signal_consolidates_legacy_duplicate():
    mock_db = MagicMock()
    legacy = {"id": "obs-old", "legacy_threat_id": "sig-3", "description": "Legacy"}
    threat = {"id": "sig-3", "title": "Noise", "description": "Bearing noise", "status": "Open"}
    mock_db.observations = MagicMock()
    mock_db.observations.find_one = AsyncMock(side_effect=[None, legacy])
    mock_db.observations.update_one = AsyncMock()
    mock_db.observations.delete_one = AsyncMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find_one = AsyncMock(return_value=threat)

    with patch("services.work_signal_lifecycle.db", mock_db):
        result = await ensure_observation_for_signal("sig-3", user={"company_id": "co-1"})

    assert result["id"] == "sig-3"
    mock_db.observations.update_one.assert_called_once()
    mock_db.observations.delete_one.assert_called_once()


@pytest.mark.asyncio
async def test_update_work_signal_writes_observation_and_threat():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.observations = MagicMock()
    mock_db.threats.find_one = AsyncMock(
        side_effect=[
            {"id": "sig-4", "title": "Heat", "status": "Open", "description": "Hot"},
            {"id": "sig-4", "title": "Heat", "status": "Closed", "description": "Hot"},
        ]
    )
    mock_db.observations.find_one = AsyncMock(return_value={"id": "sig-4", "description": "Hot"})
    mock_db.observations.update_one = AsyncMock()
    mock_db.threats.update_one = AsyncMock()
    graph_sync = AsyncMock()

    with patch("services.work_signal_lifecycle.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync",
        graph_sync,
    ):
        result = await update_work_signal(
            "sig-4",
            user={"company_id": "co-1"},
            set_fields={"status": "Closed"},
            graph_label="test_update",
        )

    assert result["id"] == "sig-4"
    mock_db.observations.update_one.assert_called_once()
    mock_db.threats.update_one.assert_called_once()
    graph_sync.assert_awaited()


@pytest.mark.asyncio
async def test_update_work_signal_skips_graph_when_disabled():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.observations = MagicMock()
    mock_db.threats.find_one = AsyncMock(
        side_effect=[
            {"id": "sig-5", "title": "Rank", "status": "Open"},
            {"id": "sig-5", "rank": 2},
        ]
    )
    mock_db.observations.find_one = AsyncMock(return_value={"id": "sig-5"})
    mock_db.observations.update_one = AsyncMock()
    mock_db.threats.update_one = AsyncMock()
    graph_sync = AsyncMock()

    with patch("services.work_signal_lifecycle.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync",
        graph_sync,
    ):
        await update_work_signal(
            "sig-5",
            user={"company_id": "co-1"},
            set_fields={"rank": 2},
            sync_graph=False,
        )

    graph_sync.assert_not_awaited()
