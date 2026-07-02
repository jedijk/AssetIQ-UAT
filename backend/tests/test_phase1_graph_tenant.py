"""Phase 1 graph tenant isolation helpers."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.reliability_graph import _edge_tenant_clause, _merge_edge_query


def test_edge_tenant_clause_strict_mode(monkeypatch):
    import services.tenant_schema as tenant_schema

    monkeypatch.setattr(tenant_schema, "TENANT_STRICT_MODE", True)
    clause = _edge_tenant_clause("Tyromer")
    assert clause == {
        "$or": [
            {"tenant_id": "Tyromer"},
            {"company_id": "Tyromer"},
        ]
    }


def test_merge_edge_query_combines_status_and_tenant(monkeypatch):
    import services.tenant_schema as tenant_schema

    monkeypatch.setattr(tenant_schema, "TENANT_STRICT_MODE", False)
    merged = _merge_edge_query({"equipment_id": "eq-1", "status": {"$ne": "retired"}}, "Tyromer")
    assert "$and" in merged
    assert merged["$and"][0]["equipment_id"] == "eq-1"
