#!/usr/bin/env python3
"""
Run golden copilot prompt eval set against ReliabilityCopilotService intent classifier.

Scores intent match rate; exits 0 when pass threshold met (default 85%).

    cd backend && python scripts/run_copilot_eval.py
    cd backend && python scripts/run_copilot_eval.py --threshold 0.9
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROMPTS_PATH = BACKEND_ROOT / "eval" / "copilot_golden_prompts.json"
DEFAULT_THRESHOLD = 0.85

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def load_prompts() -> List[Dict[str, Any]]:
    with PROMPTS_PATH.open() as f:
        data = json.load(f)
    if not isinstance(data, list) or not data:
        raise ValueError("copilot_golden_prompts.json must be a non-empty list")
    for item in data:
        for key in ("id", "prompt", "expected_intent"):
            if key not in item:
                raise ValueError(f"prompt missing required field: {key}")
    return data


def _build_service():
    from services.ril_copilot_service import ReliabilityCopilotService

    mock_db = MagicMock()
    mock_ril = MagicMock()
    return ReliabilityCopilotService(mock_db, mock_ril)


async def _run_eval(threshold: float) -> int:
    import asyncio

    prompts = load_prompts()
    service = _build_service()
    passed = 0
    failures: List[str] = []

    for item in prompts:
        intent = await service._classify_intent(item["prompt"])
        ok = intent == item["expected_intent"]
        if ok:
            passed += 1
        else:
            failures.append(
                f"{item['id']}: expected {item['expected_intent']}, got {intent}"
            )

    rate = passed / len(prompts)
    print(f"Intent match: {passed}/{len(prompts)} ({rate:.0%})")
    for msg in failures:
        print(f"  FAIL: {msg}")

    if rate >= threshold:
        print(f"OK: pass threshold {threshold:.0%}")
        return 0

    print(f"FAILED: below threshold {threshold:.0%}", file=sys.stderr)
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(description="Run copilot golden prompt eval")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Minimum intent match rate (default {DEFAULT_THRESHOLD})",
    )
    args = parser.parse_args()

    if not PROMPTS_PATH.is_file():
        print(f"Missing prompts file: {PROMPTS_PATH}", file=sys.stderr)
        return 1

    import asyncio

    return asyncio.run(_run_eval(args.threshold))


if __name__ == "__main__":
    raise SystemExit(main())
