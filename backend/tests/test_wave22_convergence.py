"""Wave 22 — maintenance strategy v2 routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_maintenance_strategy_v2_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/maintenance_strategy_v2/routes.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/maintenance_strategy_v2/routes.py").read_text(
        encoding="utf-8"
    )
    assert "maintenance_strategy_v2_service" in text
    assert len(text.splitlines()) < 320


def test_service_exists():
    from services import maintenance_strategy_v2_service as svc

    assert callable(svc.list_equipment_type_strategies)
    assert callable(svc.sync_equipment_type_strategy)
    assert callable(svc.update_task_template)
    assert callable(svc.get_equipment_sync_status)


def test_metadata_propagation_keys_exported():
    from routes.maintenance_strategy_v2.routes import METADATA_PROPAGATION_KEYS

    assert "name" in METADATA_PROPAGATION_KEYS
    assert "frequency_matrix" in METADATA_PROPAGATION_KEYS
