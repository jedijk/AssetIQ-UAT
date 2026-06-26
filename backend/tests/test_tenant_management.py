"""Unit tests for tenant management owner-only access and helpers."""
from __future__ import annotations

from fastapi import HTTPException
import pytest

from services.rbac_service import RBACService
from services.tenant_management_service import normalize_slug, validate_slug
from services.tenant_registry import (
    TENANT_STATUS_ACTIVE,
    TENANT_STATUS_BLOCKED,
    is_tenant_login_allowed,
    should_skip_tenant_jobs,
    invalidate_tenant_status_cache,
)


class _FakeDb:
    def __init__(self, tenants=None):
        self._tenants = tenants or {}

    @property
    def tenants(self):
        return self

    async def find_one(self, query, projection=None):
        tenant_id = query.get("tenant_id")
        return self._tenants.get(tenant_id)


class _FakeTenantsCollection:
    def __init__(self, tenants):
        self._tenants = tenants

    async def find_one(self, query, projection=None):
        tenant_id = query.get("tenant_id")
        return self._tenants.get(tenant_id)


class _FakeDbWrapper:
    def __init__(self, tenants):
        self.tenants = _FakeTenantsCollection(tenants)


def test_rbac_tenant_management_owner_only():
    svc = RBACService.__new__(RBACService)
    for perm in ("tenant_management:read", "tenant_management:write", "tenant_management:admin"):
        assert svc.has_permission("owner", perm) is True
        assert svc.has_permission("admin", perm) is False
        assert svc.has_permission("viewer", perm) is False


def test_normalize_slug():
    assert normalize_slug("Acme Corp") == "acme-corp"
    assert normalize_slug("  foo--bar  ") == "foo-bar"


def test_validate_slug_rejects_invalid():
    with pytest.raises(HTTPException):
        validate_slug("-")


@pytest.mark.asyncio
async def test_login_allowed_for_active_tenant(monkeypatch):
    fake_db = _FakeDbWrapper({
        "t1": {"tenant_id": "t1", "status": "active"},
    })
    monkeypatch.setattr("database.db", fake_db)
    invalidate_tenant_status_cache()
    assert await is_tenant_login_allowed("t1") is True


@pytest.mark.asyncio
async def test_login_blocked_for_suspended_tenant(monkeypatch):
    fake_db = _FakeDbWrapper({
        "t1": {"tenant_id": "t1", "status": "suspended"},
    })
    monkeypatch.setattr("database.db", fake_db)
    invalidate_tenant_status_cache()
    assert await is_tenant_login_allowed("t1") is False


@pytest.mark.asyncio
async def test_jobs_skip_suspended_tenant(monkeypatch):
    fake_db = _FakeDbWrapper({
        "t1": {"tenant_id": "t1", "status": "archived"},
    })
    monkeypatch.setattr("database.db", fake_db)
    invalidate_tenant_status_cache()
    assert await should_skip_tenant_jobs("t1") is True
    assert await should_skip_tenant_jobs("unknown") is False


@pytest.mark.asyncio
async def test_legacy_tenant_without_registry_allows_login(monkeypatch):
    fake_db = _FakeDbWrapper({})
    monkeypatch.setattr("database.db", fake_db)
    invalidate_tenant_status_cache()
    assert await is_tenant_login_allowed("legacy-tenant") is True


def test_tenant_status_sets():
    assert "active" in TENANT_STATUS_ACTIVE
    assert "trial" in TENANT_STATUS_ACTIVE
    assert "suspended" in TENANT_STATUS_BLOCKED
    assert "archived" in TENANT_STATUS_BLOCKED
