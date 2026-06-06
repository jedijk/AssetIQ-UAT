#!/usr/bin/env python3
"""
Run UAT readiness gates: schedule drift + v2 program coverage.

    cd backend && MONGO_URL=... python scripts/verify_uat_gates.py

Exit codes:
  0 — all gates passed
  1 — configuration error
  2 — one or more gates failed
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
GATES = (
    ("schedule_drift", SCRIPTS_DIR / "verify_schedule_drift.py"),
    ("v2_program_coverage", SCRIPTS_DIR / "verify_v2_program_coverage.py"),
)


def main() -> int:
    failed: list[str] = []
    for name, script in GATES:
        if not script.is_file():
            print(f"SKIP {name}: {script.name} not found", file=sys.stderr)
            continue
        print(f"\n=== Gate: {name} ===")
        result = subprocess.run([sys.executable, str(script)], check=False)
        if result.returncode == 1:
            return 1
        if result.returncode != 0:
            failed.append(name)

    if failed:
        print(f"\nFAILED gates: {', '.join(failed)}", file=sys.stderr)
        return 2

    print("\nOK: all UAT gates passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
