#!/usr/bin/env python3
"""UAT / CI gate: canonical data model registry completeness."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def main() -> int:
    from architecture.canonical_models import (
        CANONICAL_MODELS,
        validate_model_files,
        validate_repository_alignment,
        validate_ws3_coverage,
    )

    print("=== Canonical data model gate (WS3) ===\n")
    failures: list[str] = []
    failures.extend(validate_ws3_coverage())
    failures.extend(validate_model_files(BACKEND_ROOT))
    failures.extend(validate_repository_alignment())

    if failures:
        for msg in failures:
            print(f"FAIL: {msg}", file=sys.stderr)
        return 2

    print(f"OK: {len(CANONICAL_MODELS)} domains registered")
    for domain in sorted(CANONICAL_MODELS):
        model = CANONICAL_MODELS[domain]
        cols = ", ".join(model.canonical_collections)
        print(f"  {domain}: {cols}")
    print("\nOK: canonical data model gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
