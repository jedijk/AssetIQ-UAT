"""Tests for tenant_id pilot helpers."""
import importlib

from services.tenant_schema import (
    PILOT_COLLECTIONS,
    WAVE1_COLLECTIONS,
    WAVE2_COLLECTIONS,
    WAVE3_COLLECTIONS,
    merge_tenant_filter,
    prepend_tenant_match,
    tenant_filter,
    tenant_id_from_user,
    tenant_read_filter,
    with_tenant_id,
)


def test_tenant_id_from_user_prefers_company_id():
    assert tenant_id_from_user({"company_id": "co-1", "organization_id": "org-1"}) == "co-1"


def test_with_tenant_id_attaches_field():
    doc = with_tenant_id({"name": "x"}, {"company_id": "co-1"})
    assert doc["tenant_id"] == "co-1"
    assert doc["name"] == "x"


def test_tenant_filter_scopes_reads():
    assert tenant_filter({"company_id": "co-1"}) == {"tenant_id": "co-1"}
    assert tenant_filter({}) == {}


def test_pilot_collections_include_projections():
    assert "work_item_projections" in PILOT_COLLECTIONS
    assert "reliability_context_snapshots" in PILOT_COLLECTIONS
    assert "background_jobs" in PILOT_COLLECTIONS
    assert "audit_log" in PILOT_COLLECTIONS


def test_wave1_collections():
    assert WAVE1_COLLECTIONS == frozenset({
        "equipment_nodes", "threats", "users", "observations",
    })


def test_wave2_collections():
    assert "task_instances" in WAVE2_COLLECTIONS
    assert "scheduled_tasks" in WAVE2_COLLECTIONS
    assert "central_actions" in WAVE2_COLLECTIONS


def test_wave3_collections():
    assert "failure_modes" in WAVE3_COLLECTIONS
    assert "form_templates" in WAVE3_COLLECTIONS
    assert "investigations" in WAVE3_COLLECTIONS
    assert "reliability_edges" in WAVE3_COLLECTIONS


def test_prepend_tenant_match():
    user = {"company_id": "co-1"}
    pip = prepend_tenant_match([{"$count": "c"}], user)
    assert pip[0]["$match"]["$or"][0]["tenant_id"] == "co-1"


def test_tenant_read_filter_strict_mode(monkeypatch):
    monkeypatch.setenv("TENANT_STRICT_MODE", "true")
    import importlib
    import services.tenant_schema as ts

    importlib.reload(ts)
    assert ts.tenant_read_filter({"company_id": "co-1"}) == {"tenant_id": "co-1"}
    monkeypatch.delenv("TENANT_STRICT_MODE", raising=False)
    importlib.reload(ts)


def test_tenant_read_filter_migration_safe():
    assert tenant_read_filter({"company_id": "co-1"}) == {
        "$or": [
            {"tenant_id": "co-1"},
            {"tenant_id": {"$exists": False}},
        ]
    }
    assert tenant_read_filter({}) == {}


def test_merge_tenant_filter_composes_with_base_query():
    user = {"company_id": "co-1"}
    base = {"status": "open", "id": {"$in": ["a", "b"]}}
    merged = merge_tenant_filter(base, user)
    assert merged == {
        "$and": [
            base,
            {
                "$or": [
                    {"tenant_id": "co-1"},
                    {"tenant_id": {"$exists": False}},
                ]
            },
        ]
    }


def test_merge_tenant_filter_without_user_returns_base():
    base = {"approval_status": "pending"}
    assert merge_tenant_filter(base, None) == base


def test_merge_tenant_filter_tenant_only_when_empty_base():
    user = {"organization_id": "org-9"}
    assert merge_tenant_filter({}, user) == tenant_read_filter(user)
