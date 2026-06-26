#!/usr/bin/env python3
"""Heuristic audit: service files with Mongo reads but weak tenant filter usage."""
from __future__ import annotations

import re
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
SERVICES_DIR = BACKEND_DIR / "services"

FIND_RE = re.compile(r"\bdb\.\w+\.(?:find|find_one|aggregate|count_documents)\b")
TENANT_FILTER_RE = re.compile(
    r"\b(?:merge_tenant_filter|tenant_read_filter|tenant_filter|prepend_tenant_match"
    r"|scheduler_scoped|maintenance_scoped|maintenance_scoped_tenant|maintenance_scoped_job)\b"
)

# Intentionally global or cross-tenant modules.
ALLOWLIST = {
    "services/tenant_schema.py",
    "services/tenant_isolation_audit.py",
    "services/permissions_defaults.py",
    "services/rbac_service.py",
    "services/observability_metrics.py",
    "services/domain_events.py",
    "services/event_outbox.py",
}


def scan_services() -> dict:
    flagged: list[dict] = []
    clean: list[str] = []

    for path in sorted(SERVICES_DIR.rglob("*.py")):
        rel = path.relative_to(BACKEND_DIR).as_posix()
        if rel in ALLOWLIST:
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
        if find_count >= 3 and ratio < 0.25:
            flagged.append(entry)
        else:
            clean.append(rel)

    flagged.sort(key=lambda x: (-x["find_calls"], x["ratio"]))
    return {"flagged": flagged, "clean_count": len(clean)}


def main() -> int:
    report = scan_services()
    print("=== Tenant service filter audit (Phase 1) ===\n")
    print(f"Clean services scanned: {report['clean_count']}")
    if not report["flagged"]:
        print("\nNo high-risk unscoped service files detected (heuristic).")
        return 0
    print(f"\nReview recommended ({len(report['flagged'])} files, find>=3 and tenant_ratio<0.25):\n")
    for item in report["flagged"][:40]:
        print(
            f"  {item['file']}: {item['find_calls']} reads, "
            f"{item['tenant_helpers']} tenant helpers (ratio {item['ratio']})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
