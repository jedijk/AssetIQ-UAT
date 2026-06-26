"""Wave 18 — equipment import extraction and tenant hardening."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_equipment_import_route_is_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/equipment/equipment_import.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text
    assert "equipment_import_service" in text
    assert len(text.splitlines()) < 110


def test_equipment_import_service_exists():
    from services import equipment_import_service as svc

    assert callable(svc.get_unstructured_items)
    assert callable(svc.import_excel_file)
    assert callable(svc.import_equipment_hierarchy)


def test_equipment_import_service_uses_tenant_filters():
    excel = (BACKEND_ROOT / "services/equipment_import_excel.py").read_text(encoding="utf-8")
    assert "merge_tenant_filter" in excel
    assert "with_tenant_id" in excel


def test_all_equipment_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    equipment_green = [
        rel for rel in GREEN_ROUTES if rel.startswith("routes/equipment/")
    ]
    assert len(equipment_green) == 8
