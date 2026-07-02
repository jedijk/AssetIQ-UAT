"""
Cross-tenant isolation tests (Phase 2 step 4).

Verifies tenant read filters exclude foreign-tenant documents on critical domains.
"""
import importlib
import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.tenant_schema import merge_tenant_filter  # noqa: E402


def _matches_tenant_clause(doc: dict, clause: dict) -> bool:
    """Minimal matcher for tenant $or / equality clauses used in tests."""
    if "$or" in clause:
        return any(_matches_tenant_clause(doc, part) for part in clause["$or"])
    if "tenant_id" in clause:
        val = clause["tenant_id"]
        if isinstance(val, dict) and "$exists" in val:
            return val["$exists"] is False and "tenant_id" not in doc
        return doc.get("tenant_id") == val
    if "company_id" in clause:
        return doc.get("company_id") == clause["company_id"]
    return False


def _doc_visible(doc: dict, user: dict, *, strict: bool) -> bool:
    import services.tenant_schema as ts

    if strict:
        filt = ts.tenant_read_filter(user)
    else:
        filt = merge_tenant_filter({}, user)
        if filt and "$and" in filt:
            filt = filt["$and"][-1]
        elif not filt:
            filt = merge_tenant_filter({"id": "x"}, user)
            filt = filt.get("$and", [{}])[-1] if "$and" in filt else {}

    if not filt:
        return True
    tenant_part = filt.get("$or") and {"$or": filt["$or"]} or filt
    if "$or" in tenant_part:
        return _matches_tenant_clause(doc, tenant_part)
    return doc.get("tenant_id") == tenant_part.get("tenant_id")


@pytest.fixture
def strict_tenant_schema(monkeypatch):
    monkeypatch.setenv("TENANT_STRICT_MODE", "true")
    import services.tenant_schema as ts

    importlib.reload(ts)
    yield ts
    monkeypatch.delenv("TENANT_STRICT_MODE", raising=False)
    importlib.reload(ts)


@pytest.fixture
def migration_tenant_schema(monkeypatch):
    monkeypatch.delenv("TENANT_STRICT_MODE", raising=False)
    import services.tenant_schema as ts

    importlib.reload(ts)
    yield ts


USER_A = {"company_id": "co-a", "id": "user-a"}
USER_B = {"company_id": "co-b", "id": "user-b"}

CRITICAL_DOMAINS = (
    "threats",
    "central_actions",
    "task_instances",
    "investigations",
    "equipment_nodes",
    "observations",
)


@pytest.mark.parametrize("domain", CRITICAL_DOMAINS)
def test_strict_mode_hides_foreign_tenant_documents(domain, strict_tenant_schema):
    own = {"tenant_id": "co-a", "id": "doc-1", "status": "open"}
    foreign = {"tenant_id": "co-b", "id": "doc-2", "status": "open"}
    legacy = {"id": "doc-3", "status": "open"}

    assert _doc_visible(own, USER_A, strict=True) is True
    assert _doc_visible(foreign, USER_A, strict=True) is False
    assert _doc_visible(legacy, USER_A, strict=True) is False


@pytest.mark.parametrize("domain", CRITICAL_DOMAINS)
def test_migration_mode_allows_legacy_unscoped_documents(domain, migration_tenant_schema):
    own = {"tenant_id": "co-a", "id": "doc-1"}
    foreign = {"tenant_id": "co-b", "id": "doc-2"}
    legacy = {"id": "doc-3"}

    filt = merge_tenant_filter({"status": "open"}, USER_A)
    assert "$and" in filt

    assert _doc_visible(own, USER_A, strict=False) is True
    assert _doc_visible(foreign, USER_A, strict=False) is False
    assert _doc_visible(legacy, USER_A, strict=False) is True


def test_merge_tenant_filter_on_threats_query_pattern():
    query = merge_tenant_filter(
        {"status": "open", "linked_equipment_id": {"$in": ["eq-1"]}},
        USER_A,
    )
    assert "$and" in query
    assert query["$and"][0]["status"] == "open"


def test_merge_tenant_filter_on_actions_query_pattern():
    query = merge_tenant_filter(
        {"source_type": "threat", "status": "open"},
        USER_A,
    )
    assert "$and" in query
    tenant_clause = query["$and"][1]
    assert "$or" in tenant_clause


def test_merge_tenant_filter_on_work_items_query_pattern():
    query = merge_tenant_filter(
        {"status": {"$nin": ["completed", "cancelled"]}},
        USER_A,
    )
    assert "$and" in query


def test_users_without_tenant_see_unscoped_only_in_migration_mode(migration_tenant_schema):
    user_no_tenant = {"id": "solo-user"}
    assert merge_tenant_filter({"status": "open"}, user_no_tenant) == {"status": "open"}
