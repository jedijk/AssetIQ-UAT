"""Regression: production information pin endpoint must import pinned field constant."""
import ast
from pathlib import Path


def test_production_information_pin_imports_pinned_field_constant():
    path = (
        Path(__file__).resolve().parents[1]
        / "services"
        / "production_submissions_service.py"
    )
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "services.production_helpers":
            for alias in node.names:
                imported.add(alias.name)
    assert "INFORMATION_DASHBOARD_PINNED_FIELD" in imported


def test_production_helpers_reexport_private_symbols():
    from routes.production.helpers import _require_owner_or_admin, SHIFTS

    assert callable(_require_owner_or_admin)
    assert "morning" in SHIFTS
