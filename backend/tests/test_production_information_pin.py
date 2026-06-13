"""Regression: production information pin endpoint must import pinned field constant."""
import ast
from pathlib import Path


def test_production_information_pin_imports_pinned_field_constant():
    path = Path(__file__).resolve().parents[1] / "routes" / "production" / "submissions.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "routes.production.helpers":
            for alias in node.names:
                imported.add(alias.name)
    assert "INFORMATION_DASHBOARD_PINNED_FIELD" in imported
