"""Tests for RIL dashboard materialization and fast-path service reads."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from services.ril_dashboard_build import _json_safe_doc, build_ril_intelligence_payload
from services.ril_dashboard_materializer import get_or_compute_ril_dashboard
from services.ril_dashboard_service import get_intelligence_dashboard


USER = {"company_id": "co-a", "id": "user-1", "owner_id": "owner-1"}


@pytest.mark.asyncio
async def test_get_or_compute_single_flight_only_one_refresh():
    refresh_calls = 0
    refresh_started = asyncio.Event()
    release_refresh = asyncio.Event()
    cached_payload = {"executive": {}, "generated_at": "2026-01-01T00:00:00+00:00"}
    cache_available = False

    async def get_cached_side_effect(user):
        return cached_payload if cache_available else None

    async def slow_refresh(user, owner_id=None):
        nonlocal refresh_calls, cache_available
        refresh_calls += 1
        refresh_started.set()
        await release_refresh.wait()
        cache_available = True
        return cached_payload

    with patch(
        "services.ril_dashboard_materializer.get_cached_ril_dashboard",
        side_effect=get_cached_side_effect,
    ), patch(
        "services.ril_dashboard_materializer.get_stale_ril_dashboard",
        new=AsyncMock(return_value=None),
    ), patch(
        "services.ril_dashboard_materializer.refresh_ril_dashboard",
        side_effect=slow_refresh,
    ):
        task1 = asyncio.create_task(get_or_compute_ril_dashboard(USER))
        await refresh_started.wait()
        task2 = asyncio.create_task(get_or_compute_ril_dashboard(USER))
        await asyncio.sleep(0.05)
        release_refresh.set()
        results = await asyncio.gather(task1, task2)

    assert refresh_calls == 1
    assert results[0] == results[1]


@pytest.mark.asyncio
async def test_get_or_compute_returns_stale_while_refresh_in_progress():
    stale_payload = {"executive": {"reliability_score": 72}, "generated_at": "2025-12-01T00:00:00+00:00"}
    refresh_started = asyncio.Event()
    release_refresh = asyncio.Event()

    async def slow_refresh(user, owner_id=None):
        refresh_started.set()
        await release_refresh.wait()
        return {"executive": {"reliability_score": 90}, "generated_at": "2026-01-01T00:00:00+00:00"}

    with patch(
        "services.ril_dashboard_materializer.get_cached_ril_dashboard",
        new=AsyncMock(return_value=None),
    ), patch(
        "services.ril_dashboard_materializer.get_stale_ril_dashboard",
        new=AsyncMock(return_value=stale_payload),
    ), patch(
        "services.ril_dashboard_materializer.refresh_ril_dashboard",
        side_effect=slow_refresh,
    ):
        task1 = asyncio.create_task(get_or_compute_ril_dashboard(USER))
        await refresh_started.wait()
        stale_result = await get_or_compute_ril_dashboard(USER)
        release_refresh.set()
        fresh_result = await task1

    assert stale_result == stale_payload
    assert fresh_result["executive"]["reliability_score"] == 90


@pytest.mark.asyncio
async def test_intelligence_fast_path_skips_full_refresh():
    intelligence_payload = {
        "correlations": [],
        "emerging_risks": [],
        "fleet_insights": [],
        "recommendations": [],
        "generated_at": "2026-01-01T00:00:00+00:00",
    }
    with patch(
        "services.ril_dashboard_service.get_cached_ril_dashboard",
        new=AsyncMock(return_value=None),
    ), patch(
        "services.ril_dashboard_service.build_ril_intelligence_payload",
        new=AsyncMock(return_value=intelligence_payload),
    ) as build_mock, patch(
        "services.ril_dashboard_materializer.refresh_ril_dashboard",
        new=AsyncMock(),
    ) as refresh_mock:
        result = await get_intelligence_dashboard(USER)

    assert result == intelligence_payload
    build_mock.assert_awaited_once_with(USER, "owner-1")
    refresh_mock.assert_not_awaited()


def test_fleet_insights_object_id_serialization():
    oid = ObjectId()
    doc = {"_id": oid, "count": 3, "avg_health": 81.2}
    safe = _json_safe_doc(doc)
    json.dumps(safe)
    assert safe["_id"] == str(oid)
    assert isinstance(safe["_id"], str)


@pytest.mark.asyncio
async def test_build_intelligence_payload_serializes_fleet_insights_object_ids():
    oid = ObjectId()
    aggregate_doc = {"_id": oid, "count": 5, "avg_health": 70.0}

    class FakeCursor:
        def __init__(self, docs):
            self._docs = docs

        def sort(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def __aiter__(self):
            self._iter = iter(self._docs)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    class FakeAggregateCursor:
        def __init__(self, docs):
            self._docs = docs

        def __aiter__(self):
            self._iter = iter(self._docs)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    mock_db = MagicMock()
    empty_cursor = FakeCursor([])
    mock_db.ril_correlations.find.return_value = empty_cursor
    mock_db.ril_observations.find.return_value = empty_cursor
    mock_db.ril_predictions.aggregate.return_value = FakeAggregateCursor([aggregate_doc])
    mock_db.ril_recommendations.find.return_value = empty_cursor

    with patch("services.ril_dashboard_build.db", mock_db):
        payload = await build_ril_intelligence_payload(USER, "owner-1")

    assert payload["fleet_insights"][0]["_id"] == str(oid)
    json.dumps(payload)
