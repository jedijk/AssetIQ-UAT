"""Tests for tenant_id pilot helpers."""
from services.tenant_schema import (
    PILOT_COLLECTIONS,
    tenant_filter,
    tenant_id_from_user,
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
