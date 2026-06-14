"""Wave 20 — disciplines and risk settings extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_disciplines_and_risk_settings_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in ("routes/disciplines.py", "routes/risk_settings.py"):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_services_exist():
    from services import disciplines_service, risk_settings_service

    assert callable(disciplines_service.list_disciplines)
    assert callable(disciplines_service.merge_discipline_variants)
    assert callable(risk_settings_service.get_all_risk_settings)
    assert callable(risk_settings_service.update_risk_settings)


def test_risk_settings_uses_tenant_filter():
    text = (BACKEND_ROOT / "services/risk_settings_service.py").read_text(encoding="utf-8")
    assert "merge_tenant_filter" in text


def test_disciplines_route_is_thin():
    text = (BACKEND_ROOT / "routes/disciplines.py").read_text(encoding="utf-8")
    assert "disciplines_service" in text
    assert len(text.splitlines()) < 90
