#!/usr/bin/env python3
"""
UAT gate: reliability graph edge sync audit.

Static checks verify sync hooks exist in code paths; optional DB sampling
when MONGO_URL is set validates edge materialization in the target environment.

    cd backend && python scripts/verify_reliability_graph_sync.py
    cd backend && MONGO_URL=... python scripts/verify_reliability_graph_sync.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent


def _static_path_checks() -> list[str]:
    """Return list of static check failures."""
    failures: list[str] = []

    task_service = BACKEND_ROOT / "services" / "task_service.py"
    if not task_service.is_file():
        failures.append("task_service.py not found")
    else:
        src = task_service.read_text()
        if "sync_edges_for_scheduled_task" not in src:
            failures.append("task_service.complete_task missing sync_edges_for_scheduled_task")
        if "task_instance" not in src or "upsert_edge" not in src:
            failures.append("task_service.complete_task missing task_instance graph edges")

    programs = BACKEND_ROOT / "routes" / "maintenance_scheduler" / "programs.py"
    if programs.is_file():
        if "sync_edges_for_apply_strategy" not in programs.read_text():
            failures.append("programs route missing sync_edges_for_apply_strategy")
    else:
        failures.append("maintenance_scheduler/programs.py not found")

    pm_import = BACKEND_ROOT / "services" / "pm_import_service.py"
    if pm_import.is_file():
        if "_sync_pm_import_graph_edge" not in pm_import.read_text():
            failures.append("pm_import_service missing _sync_pm_import_graph_edge")
    else:
        failures.append("pm_import_service.py not found")

    audit_module = BACKEND_ROOT / "services" / "reliability_graph_audit.py"
    if not audit_module.is_file():
        failures.append("reliability_graph_audit.py not found")

    return failures


async def _db_sample_audit() -> tuple[bool, list[str]]:
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("SKIP db sampling: MONGO_URL not set")
        return True, []

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url)
    # Patch database.db for audit helpers
    import database

    database.db = client[db_name]

    from services.reliability_graph_audit import sample_db_audit

    report = await sample_db_audit(limit=int(os.environ.get("GRAPH_AUDIT_SAMPLE_LIMIT", "50")))
    client.close()

    print(f"DB sample — apply_strategy checked: {report['apply_strategy']['checked']}")
    print(f"DB sample — pm_import checked: {report['pm_import']['checked']}")
    print(f"DB sample — task_complete checked: {report['task_complete']['checked']}")
    print(f"DB sample — total gaps: {report['total_gaps']}")

    if report["total_gaps"]:
        for section in ("apply_strategy", "pm_import", "task_complete"):
            for gap in report[section]["gaps"][:5]:
                print(f"  GAP [{section}]: {gap}")
        return False, [f"{report['total_gaps']} edge gap(s) in DB sample"]

    print("OK: DB sample found no edge gaps")
    return True, []


def main() -> int:
    print("=== Reliability graph sync gate ===\n")

    static_failures = _static_path_checks()
    if static_failures:
        for msg in static_failures:
            print(f"STATIC FAIL: {msg}", file=sys.stderr)
        return 2

    print("OK: static path checks passed")

    db_ok, db_errors = asyncio.run(_db_sample_audit())
    if not db_ok:
        for msg in db_errors:
            print(f"DB FAIL: {msg}", file=sys.stderr)
        return 2

    print("\nOK: reliability graph sync gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
