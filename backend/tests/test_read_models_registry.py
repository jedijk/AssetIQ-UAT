"""WS6 — executive read models registry."""
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_ws6_dashboard_families_have_read_models():
    from architecture.read_models_registry import validate_ws6_dashboard_coverage

    assert validate_ws6_dashboard_coverage() == []


def test_read_model_materializers_exist():
    from architecture.read_models_registry import validate_materializer_files

    assert validate_materializer_files(BACKEND_ROOT) == []


def test_read_model_consumer_services_exist():
    from architecture.read_models_registry import validate_consumer_services

    assert validate_consumer_services(BACKEND_ROOT) == []


def test_read_model_collections_are_unique():
    from architecture.read_models_registry import validate_collections_unique

    assert validate_collections_unique() == []


def test_executive_kpi_read_model_wired():
    from architecture.read_models_registry import get_read_model

    spec = get_read_model("executive_kpi")
    assert spec is not None
    assert spec.collection == "executive_kpi_snapshots"
    assert spec.invalidation == "invalidate_executive_kpi"
    assert "reliability_kpis" in spec.dashboards


def test_pm_compliance_is_planned():
    from architecture.read_models_registry import get_read_model

    spec = get_read_model("pm_compliance")
    assert spec is not None
    assert spec.status == "planned"


def test_verify_read_models_script_passes():
    import importlib.util

    script = BACKEND_ROOT / "scripts" / "verify_read_models_registry.py"
    spec = importlib.util.spec_from_file_location("verify_read_models_registry", script)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    assert mod.main() == 0
