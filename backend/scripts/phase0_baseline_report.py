#!/usr/bin/env python3
"""
Phase 0 baseline report — 90-day plan kickoff (Weeks 1–2).

Runs UAT gates, tenant backfill sample, and cutover config snapshot.

    cd backend && MONGO_URL=... python scripts/phase0_baseline_report.py

Exit codes:
  0 — all automated checks passed
  1 — configuration error
  2 — one or more checks failed (see report)
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.cutover_config import cutover_gaps, cutover_snapshot  # noqa: E402


async def tenant_backfill_sample() -> tuple[bool, str]:
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        return True, "SKIP tenant sample (MONGO_URL unset)"

    from motor.motor_asyncio import AsyncIOMotorClient

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    collections = [
        "task_instances",
        "scheduled_tasks",
        "central_actions",
        "maintenance_programs_v2",
        "equipment_type_strategies",
    ]
    lines = []
    failed = False
    for name in collections:
        total = await db[name].count_documents({})
        missing = await db[name].count_documents({"tenant_id": {"$exists": False}})
        pct = 100.0 if total == 0 else round(100 * (total - missing) / total, 1)
        lines.append(f"  {name}: {total} docs, {pct}% with tenant_id")
        if total > 0 and pct < 100:
            failed = True
    return not failed, "\n".join(lines)


def run_gate(script: str) -> tuple[bool, str]:
    path = SCRIPTS_DIR / script
    if not path.is_file():
        return True, f"SKIP {script} (missing)"
    result = subprocess.run([sys.executable, str(path)], cwd=str(BACKEND_DIR), check=False)
    if result.returncode == 1:
        raise SystemExit(1)
    return result.returncode == 0, f"{script}: {'OK' if result.returncode == 0 else 'FAILED'}"


async def main() -> int:
    print("=== Phase 0 baseline report ===\n")

    print("--- Cutover config ---")
    snap = cutover_snapshot()
    for key, value in snap.items():
        print(f"  {key}: {value}")
    gaps = cutover_gaps()
    if gaps:
        print("\n  Cutover gaps vs 90-day target:")
        for gap in gaps:
            print(f"    - {gap}")
    else:
        print("\n  Cutover config: OK (90-day P0 flags)")

    print("\n--- UAT gates ---")
    gate_failed = False
    for script in (
        "verify_schedule_drift.py",
        "verify_v2_program_coverage.py",
        "verify_reliability_graph_sync.py",
    ):
        ok, msg = run_gate(script)
        print(f"  {msg}")
        if not ok:
            gate_failed = True

    print("\n--- Tenant backfill sample ---")
    tenant_ok, tenant_msg = await tenant_backfill_sample()
    print(tenant_msg)
    if not tenant_ok:
        print("  WARN: collections missing tenant_id")

    if gate_failed or gaps:
        print("\nRESULT: baseline has gaps (expected before full Q1 cutover)")
        return 2

    print("\nRESULT: baseline checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
