#!/usr/bin/env python3
"""Wave 5 tenant isolation and strict-mode readiness report."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.tenant_isolation_audit import build_isolation_report  # noqa: E402
from services.tenant_readiness import (  # noqa: E402
    format_coverage_lines,
    strict_mode_ready,
    wave_coverage,
)
from services.tenant_schema import WAVE5_COLLECTIONS  # noqa: E402


async def main() -> int:
    print("=== Wave 5 Tenant Isolation Report ===\n")
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL unset — cannot run live audit")
        return 2

    from motor.motor_asyncio import AsyncIOMotorClient

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    db = AsyncIOMotorClient(mongo_url)[db_name]

    ok, rows = await wave_coverage(db, WAVE5_COLLECTIONS)
    print(f"Wave 5 backfill: {'OK' if ok else 'GAPS'}")
    print(format_coverage_lines(rows))

    ready, gaps = await strict_mode_ready(db)
    print(f"\nStrict mode ready (waves 1-5): {ready}")
    for gap in gaps:
        print(f"  - {gap}")

    audit = [r for r in await build_isolation_report(db) if r.get("wave") == "wave5"]
    if audit:
        print("\nWave 5 collection audit:")
        for row in audit:
            print(
                f"  {row['collection']}: {row.get('missing_tenant_id', 0)} missing tenant_id, "
                f"index={'yes' if row.get('index_exists') else 'no'}"
            )

    return 0 if ready else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
