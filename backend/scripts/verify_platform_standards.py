#!/usr/bin/env python3
"""CI gate: Platform 1.0 WS8 engineering standards."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def main() -> int:
    from architecture.platform_standards import PLATFORM_STANDARD_GATES, run_platform_standards_checks

    print("=== Platform standards gate (WS8) ===\n")
    results = run_platform_standards_checks()
    failures: list[str] = []

    for gate in PLATFORM_STANDARD_GATES:
        gate_failures = results.get(gate.id, [])
        if gate_failures:
            print(f"FAIL {gate.id}: {gate.description}")
            for msg in gate_failures[:20]:
                print(f"  - {msg}")
                failures.append(f"{gate.id}: {msg}")
            if len(gate_failures) > 20:
                print(f"  ... and {len(gate_failures) - 20} more")
        else:
            print(f"OK   {gate.id}: {gate.description}")

    if failures:
        print(f"\nFAILED: {len(failures)} platform standard violation(s)", file=sys.stderr)
        return 2

    print(f"\nOK: {len(PLATFORM_STANDARD_GATES)} platform standard gates passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
