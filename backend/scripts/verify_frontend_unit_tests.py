#!/usr/bin/env python3
"""
CI gate: frontend unit test coverage and execution.

Checks:
  1. `.github/workflows/frontend-ci.yml` runs `npm run test:ci`
  2. `npm run test:ci` in frontend/ exits 0
  3. >= 85% of testable lib modules have co-located or __tests__ coverage
  4. >= 30 test suites total
  5. >= 200 tests total

Testable lib modules exclude integration-heavy files (API clients, media, kiosk bootstrap, etc.).

    cd backend && python3 scripts/verify_frontend_unit_tests.py

Exit 0 = pass, 1 = fail.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
LIB_DIR = FRONTEND_DIR / "src" / "lib"
FRONTEND_CI = REPO_ROOT / ".github" / "workflows" / "frontend-ci.yml"

MIN_LIB_COVERAGE_RATIO = 0.85
MIN_TEST_SUITES = 30
MIN_TESTS = 200

# Integration-heavy modules — excluded from lib coverage numerator/denominator.
INTEGRATION_HEAVY_LIB_MODULES = frozenset({
    "api.js",
    "apiClient.js",
    "mediaClient.js",
    "offlineQueue.js",
    "kioskBootstrap.js",
    "prefetchObservationWorkspace.js",
    "visualBoardSnapshotCapture.js",
    "polyfills.js",
    "chunkRecovery.js",
    "documentFetch.js",
    "printLabel.js",
    "imageCompression.js",
    "mediaRecorderUtils.js",
    "localNetwork.js",
    "debug.js",
    "perf.js",
})

SUITE_RE = re.compile(r"Test Suites:\s+(\d+)\s+passed,\s+(\d+)\s+total")
TESTS_RE = re.compile(r"Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total")


def _lib_source_modules() -> list[Path]:
    return sorted(
        p for p in LIB_DIR.glob("*.js")
        if p.is_file() and not p.name.endswith(".test.js")
    )


def _is_testable(module_path: Path) -> bool:
    return module_path.name not in INTEGRATION_HEAVY_LIB_MODULES


def _has_test_for_module(module_path: Path) -> bool:
    stem = module_path.stem
    if (LIB_DIR / f"{stem}.test.js").is_file():
        return True
    if (LIB_DIR / "__tests__" / f"{stem}.test.js").is_file():
        return True
    return any(LIB_DIR.glob(f"{stem}.*.test.js")) or any(
        (LIB_DIR / "__tests__").glob(f"{stem}.*.test.js")
    )


def _lib_coverage_stats() -> tuple[int, int, list[str]]:
    testable = [p for p in _lib_source_modules() if _is_testable(p)]
    missing = [p.name for p in testable if not _has_test_for_module(p)]
    tested = len(testable) - len(missing)
    return tested, len(testable), missing


def _ci_has_unit_test_step() -> bool:
    if not FRONTEND_CI.is_file():
        return False
    content = FRONTEND_CI.read_text(encoding="utf-8")
    return "npm run test:ci" in content or "test:ci" in content


def _run_jest_ci() -> tuple[bool, str, int, int]:
    if not (FRONTEND_DIR / "package.json").is_file():
        return False, "frontend/package.json missing", 0, 0

    result = subprocess.run(
        ["npm", "run", "test:ci"],
        cwd=str(FRONTEND_DIR),
        capture_output=True,
        text=True,
        check=False,
        env={**dict(**__import__("os").environ), "CI": "true"},
    )
    output = (result.stdout or "") + "\n" + (result.stderr or "")
    suites = tests = 0
    suite_match = SUITE_RE.search(output)
    tests_match = TESTS_RE.search(output)
    if suite_match:
        suites = int(suite_match.group(2))
    if tests_match:
        tests = int(tests_match.group(2))
    ok = result.returncode == 0
    tail = output.strip().splitlines()
    summary = tail[-1] if tail else f"exit {result.returncode}"
    return ok, summary, suites, tests


def main() -> int:
    print("=== Frontend unit test gate ===\n")
    failures: list[str] = []

    ci_ok = _ci_has_unit_test_step()
    print(f"{'OK' if ci_ok else 'FAIL'}  frontend-ci.yml includes unit test step")
    if not ci_ok:
        failures.append("frontend-ci.yml missing npm run test:ci step")

    tested, testable_total, missing = _lib_coverage_stats()
    ratio = tested / testable_total if testable_total else 0.0
    lib_ok = ratio >= MIN_LIB_COVERAGE_RATIO
    print(
        f"{'OK' if lib_ok else 'FAIL'}  lib module coverage: "
        f"{tested}/{testable_total} testable ({ratio * 100:.1f}%, need {MIN_LIB_COVERAGE_RATIO * 100:.0f}%)"
    )
    if missing:
        print(f"      untested: {', '.join(missing[:12])}" + (" ..." if len(missing) > 12 else ""))
    if not lib_ok:
        failures.append(
            f"lib coverage {tested}/{testable_total} ({ratio * 100:.1f}%) below {MIN_LIB_COVERAGE_RATIO * 100:.0f}%"
        )

    jest_ok, jest_summary, suites, tests = _run_jest_ci()
    print(f"{'OK' if jest_ok else 'FAIL'}  npm run test:ci ({jest_summary})")

    suites_ok = suites >= MIN_TEST_SUITES
    print(f"{'OK' if suites_ok else 'FAIL'}  test suites: {suites} (need >= {MIN_TEST_SUITES})")
    if not suites_ok:
        failures.append(f"test suites {suites} < {MIN_TEST_SUITES}")

    tests_ok = tests >= MIN_TESTS
    print(f"{'OK' if tests_ok else 'FAIL'}  tests: {tests} (need >= {MIN_TESTS})")
    if not tests_ok:
        failures.append(f"tests {tests} < {MIN_TESTS}")

    if not jest_ok:
        failures.append("npm run test:ci failed")

    if failures:
        print(f"\nFAILED: {len(failures)} check(s)", file=sys.stderr)
        for msg in failures:
            print(f"  - {msg}", file=sys.stderr)
        print(
            f"SUMMARY: lib={tested}/{testable_total} suites={suites} tests={tests} PASS=0",
        )
        return 1

    print(
        f"OK: lib={tested}/{testable_total} ({ratio * 100:.1f}%) "
        f"suites={suites} tests={tests} PASS=1"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
