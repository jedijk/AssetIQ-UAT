"""Tests for Intelligence Context Panel aggregation."""
import os

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
async def test_get_strategy_intelligence_context_not_found(monkeypatch):
    from fastapi import HTTPException

    from services.intelligence_context_service import get_strategy_intelligence_context

    async def _empty_types(*args, **kwargs):
        return []

    monkeypatch.setattr(
        "services.intelligence_context_service.list_equipment_types",
        _empty_types,
    )

    with pytest.raises(HTTPException) as exc:
        await get_strategy_intelligence_context(
            "missing-type",
            current_user={"id": "u1", "company_id": "co-1"},
        )
    assert exc.value.status_code == 404
