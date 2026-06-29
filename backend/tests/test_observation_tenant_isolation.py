"""
Wave 2 tests — observation tenant isolation via service query patterns.
"""
import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.tenant_schema import merge_tenant_filter  # noqa: E402


USER_A = {"company_id": "co-a", "id": "user-a"}
USER_B = {"company_id": "co-b", "id": "user-b"}


@pytest.fixture(autouse=True)
def migration_safe_tenant(monkeypatch):
    """These tests assert migration-safe $or tenant clauses; CI may set strict mode."""
    import services.tenant_schema as ts

    monkeypatch.setattr(ts, "TENANT_STRICT_MODE", False)


def _matches_tenant_clause(doc: dict, clause: dict) -> bool:
    if "$or" in clause:
        return any(_matches_tenant_clause(doc, part) for part in clause["$or"])
    if "tenant_id" in clause:
        val = clause["tenant_id"]
        if isinstance(val, dict) and "$exists" in val:
            return val["$exists"] is False and "tenant_id" not in doc
        return doc.get("tenant_id") == val
    return True


def _doc_visible(doc: dict, user: dict) -> bool:
    filt = merge_tenant_filter({}, user)
    tenant_part = filt.get("$and", [{}])[-1] if "$and" in filt else filt
    if "$or" in tenant_part:
        return _matches_tenant_clause(doc, tenant_part)
    if tenant_part.get("tenant_id"):
        return doc.get("tenant_id") == tenant_part["tenant_id"]
    return True


def test_observations_merge_tenant_filter_excludes_foreign_tenant():
    own = {"tenant_id": "co-a", "id": "obs-1", "status": "open"}
    foreign = {"tenant_id": "co-b", "id": "obs-2", "status": "open"}
    legacy = {"id": "obs-3", "status": "open"}

    assert _doc_visible(own, USER_A) is True
    assert _doc_visible(foreign, USER_A) is False
    assert _doc_visible(legacy, USER_A) is True


def test_observations_list_query_includes_tenant_clause():
    query = merge_tenant_filter({"equipment_id": "eq-1", "status": "open"}, USER_A)
    assert "$and" in query
    assert query["$and"][0]["equipment_id"] == "eq-1"
    tenant_clause = query["$and"][1]
    assert "$or" in tenant_clause


def test_observation_id_lookup_query_pattern():
    obs_id = "507f1f77bcf86cd799439011"
    id_query = {"$or": [{"_id": obs_id}, {"id": obs_id}]}
    scoped = merge_tenant_filter(id_query, USER_A)
    assert "$and" in scoped
    assert scoped["$and"][0] == id_query


def test_observations_in_wave1_collections():
    from services.tenant_schema import WAVE1_COLLECTIONS

    assert "observations" in WAVE1_COLLECTIONS
