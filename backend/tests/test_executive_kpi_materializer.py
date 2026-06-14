"""Tests for executive KPI materialization."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.executive_kpi_materializer import (
    get_materialized_kpis,
    get_or_compute_executive_kpis,
    refresh_executive_kpis,
)


USER = {"company_id": "co-a", "id": "user-1"}


@pytest.mark.asyncio
async def test_get_materialized_kpis_returns_none_without_tenant():
    assert await get_materialized_kpis({"id": "solo"}) is None


@pytest.mark.asyncio
async def test_get_or_compute_uses_cache_when_present():
    cached = {"open_threats": 3, "generated_at": "2026-01-01T00:00:00+00:00"}
    with patch(
        "services.executive_kpi_materializer.get_materialized_kpis",
        new=AsyncMock(return_value=cached),
    ):
        result = await get_or_compute_executive_kpis(USER)
    assert result == cached


@pytest.mark.asyncio
async def test_refresh_executive_kpis_persists_snapshot():
    kpi_payload = {"open_threats": 5, "generated_at": "2026-01-01T00:00:00+00:00"}
    mock_coll = AsyncMock()
    mock_coll.update_one = AsyncMock()

    with patch("services.executive_kpi_materializer.db") as mock_db:
        mock_db.__getitem__ = MagicMock(return_value=mock_coll)
        with patch(
            "services.executive_reliability_kpis.compute_executive_reliability_kpis",
            new=AsyncMock(return_value=kpi_payload),
        ):
            result = await refresh_executive_kpis(USER)

    assert result == kpi_payload
    mock_coll.update_one.assert_called_once()
