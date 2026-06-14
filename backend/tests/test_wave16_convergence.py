"""Wave 16 — equipment route extraction and tenant hardening."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

EQUIPMENT_GREEN = (
    "routes/equipment/equipment_history.py",
    "routes/equipment/equipment_types.py",
    "routes/equipment/equipment_utils.py",
    "routes/equipment/equipment_files.py",
)


def test_equipment_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in EQUIPMENT_GREEN:
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_equipment_services_exist():
    from services import (
        equipment_files_service,
        equipment_history_service,
        equipment_types_service,
        equipment_utils_service,
    )

    assert callable(equipment_history_service.get_equipment_history)
    assert callable(equipment_types_service.list_equipment_types)
    assert callable(equipment_utils_service.search_equipment)
    assert callable(equipment_files_service.upload_equipment_file)


def test_equipment_services_use_tenant_filters():
    for rel in (
        "services/equipment_history_service.py",
        "services/equipment_types_service.py",
        "services/equipment_utils_service.py",
        "services/equipment_files_service.py",
    ):
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "merge_tenant_filter" in text


def test_equipment_history_dropped_created_by_only_filter():
    text = (BACKEND_ROOT / "services/equipment_history_service.py").read_text(encoding="utf-8")
    assert '"created_by": current_user["id"]' not in text
    assert "merge_tenant_filter" in text
