"""Wave 17 — equipment criticality and operations extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

EQUIPMENT_GREEN = (
    "routes/equipment/equipment_criticality.py",
    "routes/equipment/equipment_operations.py",
)


def test_equipment_criticality_and_operations_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in EQUIPMENT_GREEN:
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_equipment_services_exist():
    from services import equipment_criticality_service, equipment_operations_service

    assert callable(equipment_criticality_service.assign_criticality)
    assert callable(equipment_criticality_service.get_hierarchy_stats)
    assert callable(equipment_operations_service.change_node_level)
    assert callable(equipment_operations_service.move_equipment_node)


def test_equipment_services_use_tenant_scope():
    for rel in (
        "services/equipment_criticality_service.py",
        "services/equipment_operations_service.py",
    ):
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "merge_tenant_filter" in text


def test_operations_routes_are_thin():
    text = (BACKEND_ROOT / "routes/equipment/equipment_operations.py").read_text(encoding="utf-8")
    assert "equipment_operations_service" in text
    assert len(text.splitlines()) < 60
