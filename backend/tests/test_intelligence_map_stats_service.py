"""Service-layer intelligence map stats — regression for tenant scoping and reliability KPIs."""
import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from services.intelligence_map_routes_service import (
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


@pytest.mark.asyncio
async def test_get_intelligence_map_stats_includes_reliability_edges(require_mongo):
    user = {"user_id": "ci-test", "company_id": "default", "email": "test@test.com"}
    result = await get_intelligence_map_stats(current_user=user)

    assert isinstance(result["reliability_edges_total"], int)
    reliability_graph = result.get("insights", {}).get("reliability_graph", {})
    assert reliability_graph.get("reliability_edges_total") == result["reliability_edges_total"]
