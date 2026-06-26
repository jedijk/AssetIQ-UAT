"""Wave 11 — insights and AI query tenant scoping."""
from pathlib import Path

from services.tenant_schema import merge_tenant_filter

BACKEND_ROOT = Path(__file__).resolve().parent.parent


USER_A = {"company_id": "co-a", "id": "user-a"}


def test_insights_service_uses_tenant_filter_helper():
    text = (BACKEND_ROOT / "services" / "insights_service.py").read_text(encoding="utf-8")
    assert "from services.tenant_scope import scoped" in text
    assert "scoped(user" in text


def test_ai_risk_queries_scope_threat_lookup():
    from services.ai_risk_queries import scoped

    q = scoped(USER_A, {"id": "threat-1"})
    assert q == merge_tenant_filter({"id": "threat-1"}, USER_A)
