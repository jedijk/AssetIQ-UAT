"""Wave 11 — insights and AI query tenant scoping."""
from services.tenant_schema import merge_tenant_filter


USER_A = {"company_id": "co-a", "id": "user-a"}


def test_insights_service_uses_tenant_filter_helper():
    from services import insights_service

    filt = insights_service._tf(USER_A, {"status": "open"})
    assert filt == merge_tenant_filter({"status": "open"}, USER_A)
    assert "$and" in filt


def test_ai_risk_queries_scope_threat_lookup():
    from services.ai_risk_queries import scoped

    q = scoped(USER_A, {"id": "threat-1"})
    assert q == merge_tenant_filter({"id": "threat-1"}, USER_A)
