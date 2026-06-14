"""Wave 21 — maintenance strategy helpers and propagation extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_strategy_helpers_and_propagation_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/maintenance_strategy_v2/strategy_helpers.py",
        "routes/maintenance_strategy_v2/propagation.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_strategy_helper_route_files_are_reexports():
    for rel in (
        "routes/maintenance_strategy_v2/strategy_helpers.py",
        "routes/maintenance_strategy_v2/propagation.py",
    ):
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "services.maintenance_strategy" in text
        assert len(text.splitlines()) < 10


def test_services_exist():
    from services import maintenance_strategy_helpers, maintenance_strategy_propagation

    assert callable(maintenance_strategy_helpers.clear_strategy_needs_apply)
    assert callable(maintenance_strategy_helpers.generate_default_tasks_for_failure_mode)
    assert callable(maintenance_strategy_propagation._propagate_task_template_to_programs)
    assert callable(maintenance_strategy_propagation._bump_strategy_version)


def test_routes_import_from_services():
    text = (BACKEND_ROOT / "routes/maintenance_strategy_v2/routes.py").read_text(encoding="utf-8")
    assert "maintenance_strategy_v2_service" in text
    assert "routes.maintenance_strategy_v2.strategy_helpers" not in text
    assert "routes.maintenance_strategy_v2.propagation" not in text
