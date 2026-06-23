"""Service-layer intelligence map stats — regression for tenant scoping and reliability KPIs."""
import os
from unittest.mock import AsyncMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from services.intelligence_map_routes_service import (
    _count_scheduler_scoped_open_tasks,
    _count_schedulable_program_tasks,
    _scope_pipeline,
    _scope_query,
    get_intelligence_map_stats,
)


def test_scope_query_applies_tenant_filter():
    """Regression: tenant helpers must stay wired (546f9147 removed imports → 500)."""
    scoped = _scope_query({"status": "active"}, {"company_id": "default"})
    assert "$and" in scoped
    assert scoped["$and"][0] == {"status": "active"}


def test_scope_pipeline_prepends_tenant_match():
    pipeline = _scope_pipeline([{"$match": {"a": 1}}], {"company_id": "default"})
    assert pipeline[0]["$match"]["$or"] == [
        {"tenant_id": "default"},
        {"tenant_id": {"$exists": False}},
    ]


@pytest.mark.skipif(
    bool(os.environ.get("REACT_APP_BACKEND_URL")),
    reason="Skip motor event-loop tests in HTTP integration CI mode",
)
@pytest.mark.asyncio(loop_scope="session")
async def test_get_intelligence_map_stats_includes_reliability_edges(require_mongo):
    user = {"user_id": "ci-test", "company_id": "default", "email": "test@test.com"}
    result = await get_intelligence_map_stats(current_user=user)

    assert isinstance(result["reliability_edges_total"], int)
    reliability_graph = result.get("insights", {}).get("reliability_graph", {})
    assert reliability_graph.get("reliability_edges_total") == result["reliability_edges_total"]


@pytest.mark.asyncio
async def test_count_scheduler_scoped_open_tasks_returns_zero_without_programs():
    async def _scope(query, equipment_type_id, user=None):
        query.clear()
        query["_id"] = {"$exists": False}

    with patch(
        "services.maintenance_scheduler_scope.scope_scheduled_tasks_query",
        side_effect=_scope,
    ):
        count = await _count_scheduler_scoped_open_tasks({"company_id": "default"})
    assert count == 0


@pytest.mark.asyncio
async def test_count_schedulable_program_tasks_splits_sources():
    rows = [
        {"equipment_id": "eq-1", "task_source": "strategy_generated"},
        {"equipment_id": "eq-2", "program_source": "pm_import", "task_source": "customer_imported"},
    ]

    with patch(
        "services.scheduler_program_source.load_schedulable_programs",
        new=AsyncMock(return_value=rows),
    ):
        total, from_strategy, from_pm_import = await _count_schedulable_program_tasks()

    assert total == 2
    assert from_strategy == 1
    assert from_pm_import == 1
