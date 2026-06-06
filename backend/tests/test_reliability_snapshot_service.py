"""Tests for reliability snapshot service (Digital Twin DT-1)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from services.reliability_snapshot_service import (
    COLLECTION,
    _edge_fingerprint,
    compute_equipment_reliability_snapshot,
    get_graph_at_time,
    get_week_over_week_delta,
    refresh_reliability_snapshots,
)


def test_edge_fingerprint_stable():
    assert _edge_fingerprint(["b", "a"]) == _edge_fingerprint(["a", "b"])
    assert len(_edge_fingerprint(["e1"])) == 16


@pytest.mark.asyncio
async def test_compute_equipment_reliability_snapshot_fields():
    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(
        return_value={"id": "eq-1", "tenant_id": "co-1", "equipment_type_id": "et-1"}
    )
    mock_db.threats.count_documents = AsyncMock(side_effect=[3, 1])
    mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=2)
    mock_db.task_instances.count_documents = AsyncMock(return_value=1)
    mock_db.ril_readings.find = MagicMock(
        return_value=MagicMock(
            sort=MagicMock(
                return_value=MagicMock(
                    limit=MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
                )
            )
        )
    )
    mock_db.__getitem__ = MagicMock(
        return_value=MagicMock(
            find=MagicMock(
                return_value=MagicMock(to_list=AsyncMock(return_value=[{"target_id": "fm-1"}]))
            )
        )
    )

    snap_at = datetime(2026, 6, 6, tzinfo=timezone.utc)
    with patch("services.reliability_snapshot_service.db", mock_db), patch(
        "services.reliability_snapshot_service._active_edges_at",
        AsyncMock(return_value=[{"id": "edge-1"}, {"id": "edge-2"}]),
    ):
        doc = await compute_equipment_reliability_snapshot("eq-1", snapshot_at=snap_at)

    assert doc["equipment_id"] == "eq-1"
    assert doc["tenant_id"] == "co-1"
    assert doc["open_threat_count"] == 3
    assert doc["overdue_pm_count"] == 3
    assert doc["active_failure_modes"] == ["fm-1"]
    assert doc["edge_count"] == 2
    assert 0 <= doc["health_score"] <= 100


@pytest.mark.asyncio
async def test_refresh_reliability_snapshots_upserts():
    mock_db = MagicMock()
    eq_cursor = MagicMock()

    async def _eq_iter():
        yield {"id": "eq-1", "tenant_id": "co-1"}

    eq_cursor.__aiter__ = lambda self: _eq_iter()
    mock_db.equipment_nodes.find = MagicMock(return_value=eq_cursor)
    mock_db[COLLECTION].update_one = AsyncMock()

    with patch("services.reliability_snapshot_service.db", mock_db), patch(
        "services.reliability_snapshot_service.compute_equipment_reliability_snapshot",
        AsyncMock(return_value={"equipment_id": "eq-1", "snapshot_at": "2026-06-06T00:00:00+00:00"}),
    ):
        result = await refresh_reliability_snapshots()

    assert result["upserted"] == 1
    mock_db[COLLECTION].update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_graph_at_time_filters():
    at = datetime(2026, 6, 6, 12, 0, tzinfo=timezone.utc)
    edges = [{"id": "e1", "created_at": "2026-06-01T00:00:00+00:00"}]

    with patch(
        "services.reliability_snapshot_service._active_edges_at",
        AsyncMock(return_value=edges),
    ):
        result = await get_graph_at_time("eq-1", at, user={"company_id": "co-1"})

    assert result["equipment_id"] == "eq-1"
    assert result["total"] == 1
    assert result["edges"][0]["id"] == "e1"


@pytest.mark.asyncio
async def test_get_week_over_week_delta():
    latest = {
        "snapshot_at": "2026-06-06T00:00:00+00:00",
        "health_score": 70,
        "open_threat_count": 3,
        "overdue_pm_count": 2,
        "edge_fingerprint": "abc",
    }
    prior = {
        "snapshot_at": "2026-05-30T00:00:00+00:00",
        "health_score": 80,
        "open_threat_count": 1,
        "overdue_pm_count": 0,
        "edge_fingerprint": "xyz",
    }

    with patch(
        "services.reliability_snapshot_service.get_snapshot_for_equipment",
        AsyncMock(side_effect=[latest, prior]),
    ):
        result = await get_week_over_week_delta("eq-1")

    assert result["delta"]["health_score"] == -10
    assert result["delta"]["open_threat_count"] == 2
    assert result["delta"]["edge_fingerprint_changed"] is True


def test_reliability_snapshot_job_handler_registered():
    from services.job_handlers import JOB_HANDLERS

    assert "reliability_snapshots_daily_refresh" in JOB_HANDLERS
