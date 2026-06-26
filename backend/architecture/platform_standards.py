"""
Platform engineering standards — checks and CI gates (Platform 1.0 WS8).

Verification: scripts/verify_platform_standards.py
Documentation: docs/platform/PLATFORM_STANDARDS.md
"""
from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence

from architecture.platform_standards_allowlists import (
    SERVICE_LOC_ALLOWLIST,
    TENANT_FILTER_ALLOWLIST,
    TENANT_FILTER_FLAGGED_BASELINE,
)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
SERVICES_DIR = BACKEND_ROOT / "services"

SERVICE_LOC_LIMIT = 800
SERVICE_LOC_ALLOWLIST_GROWTH_BUFFER = 50
TENANT_FIND_MIN_CALLS = 3
TENANT_HELPER_RATIO_MIN = 0.25

FIND_RE = re.compile(r"\bdb\.\w+\.(?:find|find_one|aggregate|count_documents)\b")
TENANT_FILTER_RE = re.compile(
    r"\b(?:merge_tenant_filter|tenant_read_filter|tenant_filter|prepend_tenant_match"
    r"|scheduler_scoped|maintenance_scoped|maintenance_scoped_tenant|maintenance_scoped_job"
    r"|investigation_query|inv_child_query|scoped|scoped_job|_scope_query|_scope_pipeline|_tenant_query)\("
)


@dataclass(frozen=True)
class StandardGate:
    id: str
    description: str
    doc_anchor: str = ""


PLATFORM_STANDARD_GATES: Sequence[StandardGate] = (
    StandardGate("service_module_size", "Service modules ≤800 LOC or allowlisted", "module-size"),
    StandardGate("tenant_service_filters", "Mongo reads use tenant scope helpers", "tenant-scoping"),
    StandardGate("ai_entry_points", "AI calls go through ai_platform / allowlisted transport", "ai-entry-points"),
    StandardGate("service_route_boundary", "Services must not import routes.*", "layer-boundaries"),
)


def check_service_module_sizes(*, backend_root: Path = BACKEND_ROOT) -> List[str]:
    """Fail when a service module exceeds LOC limit without an allowlist entry."""
    services_dir = backend_root / "services"
    failures: List[str] = []
    for path in services_dir.rglob("*.py"):
        if path.name == "__init__.py":
            continue
        rel = path.relative_to(services_dir).as_posix()
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        allowed = SERVICE_LOC_ALLOWLIST.get(rel) or SERVICE_LOC_ALLOWLIST.get(path.name)
        if line_count > SERVICE_LOC_LIMIT and allowed is None:
            failures.append(f"{rel}: {line_count} LOC (limit {SERVICE_LOC_LIMIT})")
        elif allowed is not None and line_count > allowed + SERVICE_LOC_ALLOWLIST_GROWTH_BUFFER:
            failures.append(f"{rel}: {line_count} LOC exceeds allowlist cap {allowed}")
    return failures


def scan_tenant_service_filters(*, backend_root: Path = BACKEND_ROOT) -> Dict[str, object]:
    """Heuristic audit: service files with Mongo reads but weak tenant filter usage."""
    services_dir = backend_root / "services"
    flagged: List[dict] = []
    clean: List[str] = []

    for path in sorted(services_dir.rglob("*.py")):
        rel = path.relative_to(backend_root).as_posix()
        if rel in TENANT_FILTER_ALLOWLIST:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        find_count = len(FIND_RE.findall(text))
        tenant_count = len(TENANT_FILTER_RE.findall(text))
        if find_count == 0:
            continue
        ratio = tenant_count / find_count if find_count else 0
        entry = {
            "file": rel,
            "find_calls": find_count,
            "tenant_helpers": tenant_count,
            "ratio": round(ratio, 2),
        }
        if find_count >= TENANT_FIND_MIN_CALLS and ratio < TENANT_HELPER_RATIO_MIN:
            flagged.append(entry)
        else:
            clean.append(rel)

    flagged.sort(key=lambda x: (-x["find_calls"], x["ratio"]))
    return {"flagged": flagged, "clean_count": len(clean)}


def check_tenant_service_filters(*, backend_root: Path = BACKEND_ROOT) -> List[str]:
    report = scan_tenant_service_filters(backend_root=backend_root)
    flagged = report.get("flagged") or []
    flagged_files = {item["file"] for item in flagged}
    failures: List[str] = []
    new_files = sorted(flagged_files - TENANT_FILTER_FLAGGED_BASELINE)
    for rel in new_files:
        item = next(i for i in flagged if i["file"] == rel)
        failures.append(
            f"new tenant scoping risk {rel}: {item['find_calls']} reads, ratio {item['ratio']}"
        )
    if len(flagged) > len(TENANT_FILTER_FLAGGED_BASELINE):
        failures.append(
            f"flagged service count {len(flagged)} exceeds baseline {len(TENANT_FILTER_FLAGGED_BASELINE)}"
        )
    return failures


def check_ai_entry_points(*, backend_root: Path = BACKEND_ROOT) -> List[str]:
    import importlib.util

    script = backend_root / "scripts" / "ai_entry_point_report.py"
    spec = importlib.util.spec_from_file_location("ai_entry_point_report", script)
    if spec is None or spec.loader is None:
        return ["ai_entry_point_report.py could not be loaded"]
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    report = mod.build_report()
    violations = report.get("violations") or []
    return [f"direct openai import: {rel}" for rel in violations]


def _service_imports(path: Path) -> List[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports: List[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
    return imports


def check_services_do_not_import_routes(*, backend_root: Path = BACKEND_ROOT) -> List[str]:
    services_dir = backend_root / "services"
    failures: List[str] = []
    for path in services_dir.rglob("*.py"):
        if path.name == "__init__.py":
            continue
        rel = path.relative_to(backend_root).as_posix()
        for imported in _service_imports(path):
            if imported.startswith("routes."):
                failures.append(f"{rel} imports forbidden route module: {imported}")
    return failures


def run_platform_standards_checks(*, backend_root: Path = BACKEND_ROOT) -> Dict[str, List[str]]:
    return {
        "service_module_size": check_service_module_sizes(backend_root=backend_root),
        "tenant_service_filters": check_tenant_service_filters(backend_root=backend_root),
        "ai_entry_points": check_ai_entry_points(backend_root=backend_root),
        "service_route_boundary": check_services_do_not_import_routes(backend_root=backend_root),
    }
