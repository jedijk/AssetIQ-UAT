#!/usr/bin/env python3
"""Heuristic audit: service files with Mongo reads but weak tenant filter usage."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from architecture.platform_standards import scan_tenant_service_filters


def scan_services() -> dict:
    return scan_tenant_service_filters(backend_root=BACKEND_DIR)


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
