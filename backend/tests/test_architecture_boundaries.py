"""Architecture regression tests — Wave 3 bounded context enforcement."""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
SERVICES_DIR = BACKEND_ROOT / "services"


def _service_imports(path: Path) -> list:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
    return imports


@pytest.mark.parametrize(
    "service_path",
    sorted(SERVICES_DIR.rglob("*.py")),
)
def test_services_do_not_import_routes(service_path: Path):
    if service_path.name == "__init__.py":
        return
    rel = service_path.relative_to(BACKEND_ROOT).as_posix()
    for imported in _service_imports(service_path):
        assert not imported.startswith("routes."), (
            f"{rel} imports forbidden route module: {imported}"
        )


def test_domain_registry_covers_observations():
    from architecture.domain_registry import DOMAINS

    assert "observations" in DOMAINS
    assert "reliability_graph" in DOMAINS
    assert "observation_service.py" in DOMAINS["observations"].services[0] or any(
        "observation" in s for s in DOMAINS["observations"].services
    )


def test_no_service_route_imports_in_apply_strategy_or_startup():
    for rel in ("services/apply_strategy_service.py", "services/startup_lifecycle.py"):
        imports = _service_imports(BACKEND_ROOT / rel)
        assert not any(i.startswith("routes.") for i in imports), rel
