"""Wave 27 — EFM routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_efms_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/efms.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/efms.py").read_text(encoding="utf-8")
    assert "efms_routes_service" in text
    assert "_library_read = require_permission" in text
    assert "_library_write = require_permission" in text
    assert len(text.splitlines()) < 100


def test_service_exists():
    from services import efms_routes_service as svc

    assert callable(svc.get_equipment_efms)
    assert callable(svc.update_efm)
    assert callable(svc.reset_efm_to_template)
