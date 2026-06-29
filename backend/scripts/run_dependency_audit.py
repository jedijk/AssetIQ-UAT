#!/usr/bin/env python3
"""CI/local gate: fail when pip-audit reports known vulnerabilities."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.dependency_audit import PROD_REQUIREMENTS, run_pip_audit  # noqa: E402


def main() -> int:
    result = run_pip_audit()
    if not result.available:
        print(f"ERROR: {result.error or 'pip-audit unavailable'}", file=sys.stderr)
        return 2
    if result.error:
        print(f"ERROR: {result.error}", file=sys.stderr)
        return 2
    print(
        f"pip-audit: scanned {result.package_count} production package(s) in "
        f"{PROD_REQUIREMENTS.name}, {result.vulnerability_count} vulnerability finding(s)"
    )
    if result.vulnerability_count:
        return 1
    print("OK: dependency audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
