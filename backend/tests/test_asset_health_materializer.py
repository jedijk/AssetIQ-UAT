"""Minimal tests for asset health materializer."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from services.asset_health_materializer import (
    COLLECTION,
    compute_equipment_snapshot,
    refresh_asset_health_documents,
)


@pytest.mark.asyncio
async def test_compute_equipment_snapshot_fields():
    now = datetime.now(timezone.utc)
    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(
        return_value={"id": "eq-1", "name": "Pump A", "tag": "P-101"}
    )
    mock_db.threats.count_documents = AsyncMock(side_effect=[2, 1])
    mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=1)
    mock_db.task_instances.count_documents = AsyncMock(return_value=0)

    threat_cursor = MagicMock()
    threat_cursor.sort = MagicMock(return_value=threat_cursor)
    threat_cursor.__aiter__ = lambda self: self
    threat_cursor._rows = iter([])
    async def _anext(_self):
        for row in _self._rows:
            yield row
    threat_cursor.__aiter__ = lambda self: self._aiter()
    async def _aiter():
        return
        yield  # pragma: no cover
    mock_db.threats.find = MagicMock(return_value=threat_cursor)

    with patch("services.asset_health_materializer.db", mock_db), patch(
        "services.asset_health_materializer._equipment_mtbf_proxy_days",
        AsyncMock(return_value=30.5),
    ):
        doc = await compute_equipment_snapshot("eq-1", snapshot_date="2026-06-06")

    assert doc["equipment_id"] == "eq-1"
    assert doc["snapshot_date"] == "2026-06-06"
    assert doc["open_threats"] == 2
    assert doc["high_risk_threats"] == 1
    assert doc["overdue_pm_flag"] is True
    assert doc["mtbf_proxy_days"] == 30.5
    assert 0 <= doc["reliability_score"] <= 100


@pytest.mark.asyncio
async def test_refresh_asset_health_documents_upserts():
    mock_db = MagicMock()
    eq_cursor = MagicMock()

    async def _eq_iter():
        yield {"id": "eq-1", "name": "Pump A", "tag": "P-101"}

    eq_cursor.__aiter__ = lambda self: _eq_iter()
    mock_db.equipment_nodes.find = MagicMock(return_value=eq_cursor)
    mock_db.threats.count_documents = AsyncMock(return_value=0)
    mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=0)
    mock_db.task_instances.count_documents = AsyncMock(return_value=0)
    mock_db[COLLECTION].update_one = AsyncMock()

    with patch("services.asset_health_materializer.db", mock_db), patch(
        "services.asset_health_materializer._equipment_mtbf_proxy_days",
        AsyncMock(return_value=None),
    ):
        result = await refresh_asset_health_documents(snapshot_date="2026-06-06")

    assert result["upserted"] == 1
    mock_db[COLLECTION].update_one.assert_awaited_once()


def test_asset_health_job_handler_registered():
    from services.job_handlers import JOB_HANDLERS

    assert "asset_health_daily_refresh" in JOB_HANDLERS
