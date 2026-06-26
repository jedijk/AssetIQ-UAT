#!/usr/bin/env python3
"""
Run Phase 1 UAT remediations then verification gates toward 9.0 audit milestone.

Requires UAT Atlas — do NOT run against production.

    cd backend && MONGO_URL=<uat-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \\
      JWT_SECRET_KEY=<secret> python3 scripts/run_uat_audit_milestone.py --dry-run

    cd backend && MONGO_URL=<uat-uri> DB_NAME=assetiq-UAT ENVIRONMENT=uat \\
      JWT_SECRET_KEY=<secret> python3 scripts/run_uat_audit_milestone.py

Exit codes:
  0 — all remediation + verification steps passed
  1 — configuration error
  2 — one or more steps failed
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent

REMEDIATION_STEPS = (
    ("failure_modes", [SCRIPTS_DIR / "seed_failure_modes.py", "--upsert-missing"]),
    ("action_mirror", [SCRIPTS_DIR / "migrate_investigation_action_items.py"]),
    ("scheduled_task_bridge", [SCRIPTS_DIR / "backfill_scheduled_task_instances.py"]),
    ("graph_history_maintenance", [
        SCRIPTS_DIR / "backfill_reliability_graph_history.py",
        "--phase",
        "maintenance",
    ]),
)

VERIFY_STEPS = (
    ("phase1_data_integrity", SCRIPTS_DIR / "phase1_data_integrity_report.py"),
    ("verify_uat_gates", SCRIPTS_DIR / "verify_uat_gates.py"),
    ("phase2_tenancy", SCRIPTS_DIR / "phase2_tenancy_report.py"),
    ("strict_mode_cutover", SCRIPTS_DIR / "strict_mode_cutover_check.py"),
    ("graph_sync_uat", SCRIPTS_DIR / "verify_reliability_graph_sync.py"),
    ("audit_scorecard", SCRIPTS_DIR / "audit_maturity_scorecard.py"),
)


def _require_uat_env() -> int | None:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    env = os.environ.get("ENVIRONMENT", "").lower()

    if not mongo_url:
        print("ERROR: MONGO_URL required", file=sys.stderr)
        return 1
    if db_name == "assetiq":
        print("ERROR: DB_NAME=assetiq looks like production — aborting", file=sys.stderr)
        return 1
    if env not in ("uat", "staging"):
        print(
            "ERROR: set ENVIRONMENT=uat (got {!r})".format(env or "(unset)"),
            file=sys.stderr,
        )
        return 1
    os.environ.setdefault("JWT_SECRET_KEY", "uat-audit-milestone")
    os.environ.setdefault("REQUIRE_JWT_SECRET_KEY", "false")
    os.environ.setdefault("WORK_ITEMS_SOURCE", "v2_instances")
    os.environ.setdefault("TENANT_STRICT_MODE", "true")
    return None


def _run_step(label: str, cmd: list, dry_run: bool) -> bool:
    print(f"\n=== {label} ===")
    if dry_run:
        print(f"  DRY RUN: {' '.join(str(c) for c in cmd)}")
        return True
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR), check=False)
    if result.returncode != 0:
        print(f"  FAIL: {label} (exit {result.returncode})", file=sys.stderr)
        return False
    print(f"  OK: {label}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="UAT audit milestone runner")
    parser.add_argument("--dry-run", action="store_true", help="Preview commands only")
    parser.add_argument("--verify-only", action="store_true", help="Skip remediations")
    args = parser.parse_args()

    err = _require_uat_env()
    if err:
        return err

    py = sys.executable
    failed: list[str] = []

    if not args.verify_only:
        print("=== UAT Audit Milestone — Remediation Phase ===")
        for name, script_args in REMEDIATION_STEPS:
            script = script_args[0]
            extra = list(script_args[1:])
            if args.dry_run and name != "failure_modes":
                extra = ["--dry-run"] + extra if script.name.startswith("backfill") or script.name.startswith("migrate") else extra
            cmd = [py, str(script)] + extra
            if not _run_step(name, cmd, args.dry_run):
                failed.append(name)

    print("\n=== UAT Audit Milestone — Verification Phase ===")
    for name, script in VERIFY_STEPS:
        if not script.is_file():
            print(f"  SKIP: {script.name} not found")
            continue
        cmd = [py, str(script)]
        if not _run_step(name, cmd, args.dry_run):
            failed.append(name)

    if failed:
        print(f"\nFAILED steps: {', '.join(failed)}", file=sys.stderr)
        return 2

    print("\nOK: UAT audit milestone run complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
