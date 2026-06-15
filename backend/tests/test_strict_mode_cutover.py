"""Wave 6 strict mode cutover tests."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.tenant_schema import WAVE5_COLLECTIONS, WAVE_COLLECTIONS
from services.tenant_readiness import collection_tenant_coverage, strict_mode_ready


def test_all_waves_in_wave_collections():
    assert WAVE5_COLLECTIONS.issubset(WAVE_COLLECTIONS)


def test_strict_mode_defaults_off():
    import importlib
    import services.tenant_schema as ts

    importlib.reload(ts)
    assert ts.TENANT_STRICT_MODE is False


@pytest.mark.asyncio
async def test_collection_tenant_coverage_marks_incomplete_rows():
    mock_col = MagicMock()
    mock_col.count_documents = AsyncMock(side_effect=[10, 2])
    mock_db = MagicMock()
    mock_db.__getitem__.return_value = mock_col

    row = await collection_tenant_coverage(mock_db, "threats")

    assert row["total"] == 10
    assert row["missing"] == 2
    assert row["complete"] is False


@pytest.mark.asyncio
async def test_strict_mode_ready_reports_wave_gaps(monkeypatch):
    mock_db = MagicMock()

    async def _coverage(db, collections):
        del db, collections
        return False, [{"collection": "threats", "total": 1, "complete": False}]

    monkeypatch.setattr("services.tenant_readiness.phase2_exit_ready", AsyncMock(return_value=(False, ["wave1 gap"])))
    monkeypatch.setattr("services.tenant_readiness.wave_coverage", AsyncMock(side_effect=_coverage))
    monkeypatch.setattr("services.tenant_readiness.wave4_exit_ready", AsyncMock(return_value=(True, [])))
    monkeypatch.setattr("services.tenant_readiness.wave5_exit_ready", AsyncMock(return_value=(True, [])))

    ready, gaps = await strict_mode_ready(mock_db)

    assert ready is False
    assert any("wave1 gap" in gap for gap in gaps)
