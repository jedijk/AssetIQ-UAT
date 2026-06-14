"""Wave 25 — maintenance program routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_maintenance_program_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/maintenance_program.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/maintenance_program.py").read_text(encoding="utf-8")
    assert "maintenance_program_routes_service" in text
    assert "_scheduler_write = require_permission" in text
    assert len(text.splitlines()) < 240


def test_service_exists():
    from services import maintenance_program_routes_service as svc

    assert callable(svc.list_maintenance_programs)
    assert callable(svc.get_maintenance_program)
    assert callable(svc.bulk_regenerate_programs)
