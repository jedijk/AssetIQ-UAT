"""WS8 — platform engineering standards."""
from __future__ import annotations

import importlib.util
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_platform_standard_gates_defined():
    from architecture.platform_standards import PLATFORM_STANDARD_GATES

    gate_ids = {gate.id for gate in PLATFORM_STANDARD_GATES}
    assert gate_ids == {
        "service_module_size",
        "tenant_service_filters",
        "ai_entry_points",
        "service_route_boundary",
    }


def test_service_module_size_gate_passes():
    from architecture.platform_standards import check_service_module_sizes

    assert check_service_module_sizes(backend_root=BACKEND_ROOT) == []


def test_tenant_audit_reports_zero_flagged():
    from architecture.platform_standards import (
        TENANT_FILTER_FLAGGED_BASELINE,
        check_tenant_service_filters,
        scan_tenant_service_filters,
    )

    flagged = {item["file"] for item in scan_tenant_service_filters(backend_root=BACKEND_ROOT)["flagged"]}
    assert flagged == set(TENANT_FILTER_FLAGGED_BASELINE)
    assert check_tenant_service_filters(backend_root=BACKEND_ROOT) == []


def test_service_route_boundary_passes():
    from architecture.platform_standards import check_services_do_not_import_routes

    assert check_services_do_not_import_routes(backend_root=BACKEND_ROOT) == []


def test_verify_platform_standards_script_passes():
    script = BACKEND_ROOT / "scripts" / "verify_platform_standards.py"
    spec = importlib.util.spec_from_file_location("verify_platform_standards", script)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    assert mod.main() == 0
