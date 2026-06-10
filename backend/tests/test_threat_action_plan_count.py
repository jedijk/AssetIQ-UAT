"""Unit tests for observation list action plan count enrichment."""
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.threat_enrichment import enrich_with_action_plan_counts


class _AsyncIter:
    def __init__(self, items):
        self._items = list(items)

    def __aiter__(self):
        self._iter = iter(self._items)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_enrich_with_action_plan_counts_sums_actions_and_investigation(monkeypatch):
    mock_db = MagicMock()
    mock_db.central_actions.aggregate = MagicMock(
        return_value=_AsyncIter([{"_id": "obs-1", "count": 2}, {"_id": "obs-2", "count": 1}])
    )
    mock_db.investigations.find = MagicMock(
        return_value=_AsyncIter([{"threat_id": "obs-1"}])
    )
    monkeypatch.setattr("services.threat_enrichment.db", mock_db)

    items = [{"id": "obs-1"}, {"id": "obs-2"}, {"id": "obs-3"}]
    result = await enrich_with_action_plan_counts(items)

    assert result[0]["action_plan_count"] == 3  # 2 actions + investigation
    assert result[1]["action_plan_count"] == 1
    assert result[2]["action_plan_count"] == 0


@pytest.mark.asyncio
async def test_enrich_with_action_plan_counts_empty_list():
    assert await enrich_with_action_plan_counts([]) == []
