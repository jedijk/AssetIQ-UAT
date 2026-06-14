"""Wave 28 — legacy maintenance strategy routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_maintenance_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/maintenance.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/maintenance.py").read_text(encoding="utf-8")
    assert "maintenance_routes_service" in text
    assert "_scheduler_read = require_permission" in text
    assert len(text.splitlines()) < 130


def test_service_exists():
    from services import maintenance_routes_service as svc

    assert callable(svc.list_maintenance_strategies)
    assert callable(svc.generate_maintenance_strategy)
    assert callable(svc._block_legacy_v1_mutation)


def test_routes_reexport_legacy_blocker():
    from routes.maintenance import _block_legacy_v1_mutation

    assert callable(_block_legacy_v1_mutation)
