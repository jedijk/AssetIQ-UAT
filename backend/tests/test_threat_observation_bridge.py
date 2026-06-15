"""Threat ↔ observation bridge tests."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.threat_observation_bridge import (
    list_unified_signals,
    mirror_threat_to_observation,
    threat_to_observation_doc,
)

USER = {"company_id": "co-1", "id": "user-1"}


def test_threat_to_observation_doc_sets_legacy_threat_id():
    threat = {
        "id": "threat-abc",
        "title": "Leak",
        "description": "Oil leak",
        "linked_equipment_id": "eq-1",
        "risk_score": 70,
        "risk_level": "High",
        "created_by": "user-1",
    }
    doc = threat_to_observation_doc(threat, user=USER)
    assert doc["legacy_threat_id"] == "threat-abc"
    assert doc["tenant_id"] == "co-1"
    assert doc["equipment_id"] == "eq-1"
    assert doc["source"] == "threat_mirror"


@pytest.mark.asyncio
async def test_mirror_threat_to_observation_skips_duplicate():
    mock_db = MagicMock()
    obs_col = MagicMock()
    mock_db.observations = obs_col
    obs_col.find_one = AsyncMock(return_value={"id": "obs-existing", "legacy_threat_id": "t-1"})
    obs_col.insert_one = AsyncMock()

    with patch("services.threat_observation_bridge.db", mock_db):
        result = await mirror_threat_to_observation({"id": "t-1"}, user=USER)

    assert result == "obs-existing"
    obs_col.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_mirror_threat_to_observation_inserts_new():
    mock_db = MagicMock()
    obs_col = MagicMock()
    mock_db.observations = obs_col
    obs_col.find_one = AsyncMock(return_value=None)
    obs_col.insert_one = AsyncMock()

    threat = {"id": "t-2", "title": "Vibration", "status": "Open", "created_by": "user-1"}

    with patch("services.threat_observation_bridge.db", mock_db):
        result = await mirror_threat_to_observation(threat, user=USER)

    assert result
    obs_col.insert_one.assert_called_once()
    inserted = obs_col.insert_one.call_args[0][0]
    assert inserted["legacy_threat_id"] == "t-2"


@pytest.mark.asyncio
async def test_list_unified_signals_deduplicates_mirrored_threats():
    mock_db = MagicMock()
    threats_col = MagicMock()
    obs_col = MagicMock()
    mock_db.threats = threats_col
    mock_db.observations = obs_col

    threat_cursor = MagicMock()
    threat_cursor.sort.return_value = threat_cursor
    threat_cursor.to_list = AsyncMock(
        return_value=[{"id": "t-1", "title": "A", "status": "open", "created_at": "2026-01-02"}]
    )
    threats_col.find.return_value = threat_cursor

    obs_cursor = MagicMock()
    obs_cursor.sort.return_value = obs_cursor
    obs_cursor.to_list = AsyncMock(
        return_value=[
            {
                "id": "o-1",
                "legacy_threat_id": "t-1",
                "title": "A mirror",
                "status": "open",
                "created_at": "2026-01-02",
            }
        ]
    )
    obs_col.find.return_value = obs_cursor

    with patch("services.threat_observation_bridge.db", mock_db):
        items = await list_unified_signals(user=USER, limit=10)

    assert len(items) == 1
    assert items[0].get("legacy_threat_id") == "t-1"


@pytest.mark.asyncio
async def test_sync_threat_mirror_updates_existing():
    mock_db = MagicMock()
    obs_col = MagicMock()
    mock_db.observations = obs_col
    obs_col.find_one = AsyncMock(return_value={"id": "obs-1", "legacy_threat_id": "t-1"})
    obs_col.update_one = AsyncMock()
    obs_col.insert_one = AsyncMock()

    threat = {"id": "t-1", "description": "Updated", "status": "open", "risk_level": "High"}
    with patch("services.threat_observation_bridge.db", mock_db):
        from services.threat_observation_bridge import sync_threat_mirror

        result = await sync_threat_mirror(threat, user=USER)
    assert result == "obs-1"
    obs_col.update_one.assert_called_once()
    obs_col.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_count_unified_open_signals_dedupes_mirrors():
    mock_db = MagicMock()
    mock_db.observations = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.observations.distinct = AsyncMock(return_value=["t-mirrored"])
    mock_db.threats.count_documents = AsyncMock(return_value=2)
    mock_db.observations.count_documents = AsyncMock(return_value=3)

    with patch("services.threat_observation_bridge.db", mock_db):
        from services.threat_observation_bridge import count_unified_open_signals

        total = await count_unified_open_signals(user=USER)
    assert total == 5
    threat_filter = mock_db.threats.count_documents.call_args[0][0]
    assert threat_filter["id"] == {"$nin": ["t-mirrored"]}
