"""Tests for Intelligence Context Panel aggregation."""
import os
from unittest.mock import patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("DB_NAME", "test")

from services.intelligence_context_service import (
    _annual_occurrences,
    _risk_reduction_rating,
)


def test_annual_occurrences_monthly():
    assert _annual_occurrences("monthly") == pytest.approx(365 / 30, rel=0.01)


def test_annual_occurrences_defaults_to_annual():
    assert _annual_occurrences(None) == pytest.approx(1.0)


def test_risk_reduction_rating_high():
    assert _risk_reduction_rating(25, 2, 10) == "High"


def test_risk_reduction_rating_low():
    assert _risk_reduction_rating(2, 0, 3) == "Low"


@pytest.mark.asyncio
async def test_resolve_equipment_type_falls_back_to_iso_library():
    from services.intelligence_context_service import _resolve_equipment_type

    async def _empty_registry(*args, **kwargs):
        return []

    with patch(
        "services.intelligence_context_service.list_equipment_types",
        side_effect=_empty_registry,
    ):
        resolved = await _resolve_equipment_type("bearing_radial")

    assert resolved is not None
    assert resolved["id"] == "bearing_radial"
    assert resolved["name"] == "Radial Bearing"


@pytest.mark.asyncio
async def test_get_strategy_intelligence_context_not_found():
    from unittest.mock import AsyncMock, MagicMock

    from fastapi import HTTPException

    from services.intelligence_context_service import get_strategy_intelligence_context

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=None)
    mock_db.equipment_nodes.find_one = AsyncMock(return_value=None)

    async def _empty_types(*args, **kwargs):
        return []

    with patch(
        "services.intelligence_context_service.list_equipment_types",
        side_effect=_empty_types,
    ), patch(
        "services.intelligence_context_service.db",
        mock_db,
    ):
        with pytest.raises(HTTPException) as exc:
            await get_strategy_intelligence_context(
                "missing-type",
                current_user={"id": "u1", "company_id": "co-1"},
            )
    assert exc.value.status_code == 404
