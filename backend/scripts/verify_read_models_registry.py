#!/usr/bin/env python3
"""UAT / CI gate: executive read model registry completeness (WS6)."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def main() -> int:
    from architecture.read_models_registry import (
        READ_MODELS,
        WS6_DASHBOARD_FAMILIES,
        validate_collections_unique,
        validate_consumer_services,
        validate_materializer_files,
        validate_ws6_dashboard_coverage,
    )

    print("=== Executive read models gate (WS6) ===\n")
    failures: list[str] = []
    failures.extend(validate_ws6_dashboard_coverage())
    failures.extend(validate_materializer_files(BACKEND_ROOT))
    failures.extend(validate_consumer_services(BACKEND_ROOT))
    failures.extend(validate_collections_unique())

    if failures:
        for msg in failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 2

    active = sum(1 for s in READ_MODELS.values() if s.status == "active")
    partial = sum(1 for s in READ_MODELS.values() if s.status == "partial")
    planned = sum(1 for s in READ_MODELS.values() if s.status == "planned")
    print(f"OK: {len(READ_MODELS)} read models ({active} active, {partial} partial, {planned} planned)")
    print(f"OK: {len(WS6_DASHBOARD_FAMILIES)} dashboard families covered")
    for rid in sorted(READ_MODELS):
        spec = READ_MODELS[rid]
        if spec.collection:
            print(f"  {rid}: {spec.collection} [{spec.status}]")
        else:
            print(f"  {rid}: (planned) [{spec.status}]")
    print("\nOK: read models registry gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
