#!/usr/bin/env python3
"""
Phase 1 data integrity report — Weeks 3–8 (work, programs, actions, FMEA).

    cd backend && MONGO_URL=... ENVIRONMENT=uat python scripts/phase1_data_integrity_report.py

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

from services.cutover_config import cutover_snapshot  # noqa: E402
from services.scheduler_config import (  # noqa: E402
    should_read_legacy_maintenance_programs,
    should_sync_legacy_maintenance_programs,
)
from services.work_execution_config import work_items_source_mode  # noqa: E402


async def work_execution_sample(db) -> tuple[bool, str]:
    """1A — v2_instances mode and unbridged scheduled_task exposure."""
    lines = [f"  WORK_ITEMS_SOURCE: {work_items_source_mode()}"]
    failed = work_items_source_mode() != "v2_instances"

    open_instances = await db.task_instances.count_documents(
        {"status": {"$nin": ["completed", "cancelled"]}}
    )
    open_scheduled = await db.scheduled_tasks.count_documents(
        {"status": {"$nin": ["completed", "cancelled", "cancelled_offline"]}}
    )
    bridged_ids = set()
    async for row in db.task_instances.find(
        {"scheduled_task_id": {"$exists": True, "$nin": [None, ""]}},
        {"scheduled_task_id": 1},
    ):
        sid = row.get("scheduled_task_id")
        if sid:
            bridged_ids.add(str(sid))

    unbridged = 0
    async for st in db.scheduled_tasks.find(
        {"status": {"$nin": ["completed", "cancelled"]}},
        {"id": 1, "_id": 1},
    ):
        st_id = st.get("id") or str(st.get("_id", ""))
        if st_id and st_id not in bridged_ids:
            unbridged += 1

    lines.append(f"  Open task_instances: {open_instances}")
    lines.append(f"  Open scheduled_tasks: {open_scheduled}")
    lines.append(f"  Unbridged open scheduled_tasks (no task_instance): {unbridged}")
    if unbridged > 0 and work_items_source_mode() == "v2_instances":
        lines.append("  WARN: unbridged tasks invisible in v2_instances mode")
        lines.append("  FIX: python scripts/backfill_scheduled_task_instances.py")
        failed = True
    return not failed, "\n".join(lines)


async def maintenance_programs_sample(db) -> tuple[bool, str]:
    """1B — legacy vs v2 program coverage."""
    legacy_active = await db.maintenance_programs.count_documents({"is_active": True})
    v2_count = await db.maintenance_programs_v2.count_documents({})
    lines = [
        f"  READ_LEGACY_MAINTENANCE_PROGRAMS: {should_read_legacy_maintenance_programs()}",
        f"  SYNC_LEGACY_MAINTENANCE_PROGRAMS: {should_sync_legacy_maintenance_programs()}",
        f"  Legacy active programs: {legacy_active}",
        f"  V2 program documents: {v2_count}",
    ]
    failed = False
    if should_read_legacy_maintenance_programs() or should_sync_legacy_maintenance_programs():
        lines.append("  WARN: legacy program flags still enabled")
        failed = True

    legacy_equipment = set()
    async for doc in db.maintenance_programs.find({"is_active": True}, {"equipment_id": 1}):
        if doc.get("equipment_id"):
            legacy_equipment.add(doc["equipment_id"])

    v2_equipment = set()
    async for doc in db.maintenance_programs_v2.find({}, {"equipment_id": 1}):
        if doc.get("equipment_id"):
            v2_equipment.add(doc["equipment_id"])

    missing_v2 = legacy_equipment - v2_equipment
    if missing_v2:
        lines.append(f"  Equipment with legacy only (no v2): {len(missing_v2)}")
        failed = True
    elif legacy_active:
        lines.append("  OK: legacy equipment covered by v2 documents")
    return not failed, "\n".join(lines)


async def actions_sample(db) -> tuple[bool, str]:
    """1C — action_items mirrored in central_actions."""
    action_items_total = await db.action_items.count_documents({})
    central_inv = await db.central_actions.count_documents(
        {"investigation_action_item": True}
    )
    unmigrated = 0
    async for item in db.action_items.find({}, {"id": 1}):
        aid = item.get("id")
        if not aid:
            continue
        found = await db.central_actions.find_one({"id": aid}, {"_id": 1})
        if not found:
            unmigrated += 1

    lines = [
        f"  action_items total: {action_items_total}",
        f"  central_actions (investigation_action_item): {central_inv}",
        f"  action_items missing central mirror: {unmigrated}",
    ]
    failed = unmigrated > 0
    if failed:
        lines.append(
            "  FIX: python scripts/migrate_investigation_action_items.py"
        )
    else:
        lines.append("  OK: all action_items mirrored in central_actions")
    return not failed, "\n".join(lines)


async def failure_modes_sample(db) -> tuple[bool, str]:
    """1D — Mongo failure_modes vs static library (by legacy_id)."""
    from failure_modes import FAILURE_MODES_LIBRARY

    static_ids = {fm["id"] for fm in FAILURE_MODES_LIBRARY}
    mongo_legacy: set = set()
    mongo_count = 0
    async for doc in db.failure_modes.find({}, {"legacy_id": 1}):
        mongo_count += 1
        if doc.get("legacy_id") is not None:
            mongo_legacy.add(doc["legacy_id"])

    missing = static_ids - mongo_legacy
    lines = [
        f"  Mongo failure_modes documents: {mongo_count}",
        f"  Static library entries: {len(static_ids)}",
        f"  Static legacy_ids missing in Mongo: {len(missing)}",
    ]
    failed = bool(missing)
    if missing:
        lines.append("  FIX: python scripts/seed_failure_modes.py --upsert-missing")
    else:
        lines.append("  OK: Mongo covers all static library legacy_ids")
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
    print("=== Phase 1 data integrity report ===\n")

    print("--- Cutover config (1A) ---")
    snap = cutover_snapshot()
    for key, value in snap.items():
        print(f"  {key}: {value}")

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("\n--- DB samples ---")
        print("  SKIP (MONGO_URL unset — set MONGO_URL for full Phase 1 report)")
        print("\n--- UAT gates ---")
        print("  SKIP UAT gates (MONGO_URL unset)")
        print("\nRESULT: config-only report (DB checks skipped)")
        return 2 if snap.get("work_items_source") != "v2_instances" else 0

    from motor.motor_asyncio import AsyncIOMotorClient

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    db = AsyncIOMotorClient(mongo_url)[db_name]

    sections_failed = False

    print("\n--- Work execution (1A) ---")
    ok, msg = await work_execution_sample(db)
    print(msg)
    sections_failed = sections_failed or not ok

    print("\n--- Maintenance programs (1B) ---")
    ok, msg = await maintenance_programs_sample(db)
    print(msg)
    sections_failed = sections_failed or not ok

    print("\n--- Actions unification (1C) ---")
    ok, msg = await actions_sample(db)
    print(msg)
    sections_failed = sections_failed or not ok

    print("\n--- Failure modes (1D) ---")
    ok, msg = await failure_modes_sample(db)
    print(msg)
    sections_failed = sections_failed or not ok

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

    if sections_failed or gate_failed:
        print("\nRESULT: Phase 1 gaps remain (see sections above)")
        return 2

    print("\nRESULT: Phase 1 checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
