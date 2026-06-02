"""Tests for unified cache service."""
import pytest

from services.unified_cache import CacheDomain, unified_cache, invalidate_equipment_related


@pytest.fixture(autouse=True)
def clear_cache():
    unified_cache.clear_all()
    yield
    unified_cache.clear_all()


def test_query_cache_hit_miss():
    unified_cache.query_set("equipment_nodes:test-user", {"nodes": []}, ttl=60)
    assert unified_cache.query_get("equipment_nodes:test-user") == {"nodes": []}
    assert unified_cache.query_get("equipment_nodes:missing") is None
    stats = unified_cache.get_stats()
    assert stats["hits"] >= 1
    assert stats["misses"] >= 1


def test_equipment_domain_invalidation():
    unified_cache.set_equipment("node-1", {"id": "node-1", "name": "Pump"})
    unified_cache.query_set("equipment_nodes:user-1", {"nodes": [{"id": "node-1"}]}, ttl=60)
    unified_cache.query_set("dashboard:main", {"kpi": 1}, ttl=60)

    counts = invalidate_equipment_related(equipment_id="node-1", equipment_name="Pump")
    assert counts["query"] >= 1
    assert unified_cache.get_equipment("node-1") is None
    assert unified_cache.get_equipment("name:Pump") is None
    assert unified_cache.query_get("equipment_nodes:user-1") is None


def test_invalidate_domain_forms():
    unified_cache.query_set("form_templates:all", [{"id": "t1"}], ttl=60)
    unified_cache.invalidate_domain(CacheDomain.FORMS)
    assert unified_cache.query_get("form_templates:all") is None
