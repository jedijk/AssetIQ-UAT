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


class _FakeUsersCollection:
    def __init__(self, tenant_ids=None):
        self._tenant_ids = tenant_ids or ["Tyromer"]

    async def aggregate(self, pipeline):
        field = "$tenant_id"
        for stage in pipeline:
            if "$group" in stage:
                field = stage["$group"].get("_id", field)
        key = field.replace("$", "")
        for tid in self._tenant_ids:
            if key == "tenant_id":
                yield {"_id": tid}
            elif key == "company_id":
                yield {"_id": tid}

    async def find_one(self, query, projection=None, sort=None):
        tid = None
        if "$or" in query:
            for clause in query["$or"]:
                tid = clause.get("tenant_id") or clause.get("company_id")
                if tid:
                    break
        else:
            tid = query.get("tenant_id") or query.get("company_id")
        if not tid:
            return None
        role = query.get("role")
        if role and role != "admin":
            return None
        return {
            "id": "u-1",
            "name": "Admin",
            "email": f"admin@{tid.lower()}.com",
            "role": "admin",
            "tenant_id": tid,
            "company_id": tid,
            "created_at": "2024-01-01T00:00:00Z",
        }

    async def count_documents(self, query):
        if "$or" in query:
            return len(self._tenant_ids)
        return 0


class _FakeEquipmentCollection:
    async def count_documents(self, query):
        tenant_id = query.get("tenant_id")
        if tenant_id in ("Tyromer",):
            return 5
        return 0


class _FakeTenantsCollectionList:
    def __init__(self):
        self._docs = []

    def find(self, query, projection=None):
        return _FakeFindCursor(self._docs)

    async def find_one(self, query, projection=None):
        return None

    async def insert_one(self, doc):
        self._docs.append(doc)


class _FakeFindCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length):
        return list(self._docs)

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_list_tenants_includes_legacy_tyromer():
    from services.tenant_management_service import list_tenants

    fake_db = type("Db", (), {})()
    fake_db.tenants = _FakeTenantsCollectionList()
    fake_db.users = _FakeUsersCollection(["Tyromer"])
    fake_db.equipment_nodes = _FakeEquipmentCollection()

    tenants = await list_tenants(fake_db)
    assert len(tenants) == 1
    assert tenants[0]["tenant_id"] == "Tyromer"
    assert tenants[0]["registry_status"] == "legacy"
    assert tenants[0]["user_count"] == 1
