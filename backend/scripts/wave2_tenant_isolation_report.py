#!/usr/bin/env python3
"""
Wave 2 tenant isolation report — enterprise foundation hardening.

    cd backend && MONGO_URL=... python scripts/wave2_tenant_isolation_report.py

Exit codes:
  0 — all wave collections backfilled and indexed
  1 — configuration error
  2 — gaps remain
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.cutover_config import cutover_snapshot  # noqa: E402
from services.tenant_isolation_audit import build_isolation_report  # noqa: E402
from services.tenant_readiness import format_coverage_lines, phase2_exit_ready, wave_coverage  # noqa: E402
from services.tenant_schema import (  # noqa: E402
    WAVE1_COLLECTIONS,
    WAVE2_COLLECTIONS,
    WAVE3_COLLECTIONS,
)


def _print_table(rows):
    print(f"{'Collection':<32} {'Wave':<12} {'Scoped':<8} {'Index':<8} {'Backfill':<10} {'Docs':<8}")
    print("-" * 88)
    for row in rows:
        idx = row.get("index_exists")
        idx_str = "yes" if idx is True else ("no" if idx is False else "n/a")
        scoped = "yes" if row.get("tenant_scoped") else "no"
        backfill = "ok" if row.get("backfill_complete") else "GAP"
        print(
            f"{row['collection']:<32} {row.get('wave', ''):<12} {scoped:<8} "
            f"{idx_str:<8} {backfill:<10} {row.get('total_documents', 0):<8}"
        )


async def main() -> int:
    print("=== Wave 2 Tenant Isolation Report ===\n")
    snap = cutover_snapshot()
    strict = snap.get("tenant_strict_mode", False)
    print(f"TENANT_STRICT_MODE: {strict}")

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("\nMONGO_URL unset — config-only report")
        return 2

    from motor.motor_asyncio import AsyncIOMotorClient

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    db = AsyncIOMotorClient(mongo_url)[db_name]

    print("\n--- Wave coverage ---")
    for label, wave in (
        ("Wave 1", WAVE1_COLLECTIONS),
        ("Wave 2", WAVE2_COLLECTIONS),
        ("Wave 3", WAVE3_COLLECTIONS),
    ):
        ok, rows = await wave_coverage(db, wave)
        print(f"\n{label} ({'OK' if ok else 'GAPS'}):")
        print(format_coverage_lines(rows))

    ready, gaps = await phase2_exit_ready(db)
    print("\n--- Strict mode readiness (Wave 1 + Wave 2) ---")
    print(f"  Ready: {ready}")
    for gap in gaps:
        print(f"  - {gap}")

    print("\n--- Full isolation audit ---")
    audit_rows = await build_isolation_report(db)
    _print_table(audit_rows)

    unscoped_gaps = [
        r for r in audit_rows
        if r.get("tenant_scoped") and not r.get("backfill_complete")
    ]
    missing_indexes = [
        r for r in audit_rows
        if r.get("index_expected") and r.get("index_exists") is False
    ]

    if unscoped_gaps or missing_indexes or not ready:
        print("\nRESULT: gaps remain — strict mode not safe to enable")
        return 2

    print("\nRESULT: Wave 2 tenant isolation gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
