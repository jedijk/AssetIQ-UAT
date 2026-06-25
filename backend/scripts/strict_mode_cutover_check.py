#!/usr/bin/env python3
"""Strict mode cutover readiness — Wave 6 enterprise rollout gate."""
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
from services.tenant_schema import (  # noqa: E402
    TENANT_STRICT_MODE,
    WAVE_COLLECTIONS,
)


async def main() -> int:
    print("=== Strict Mode Cutover Check (Waves 1–11) ===\n")
    print(f"Current TENANT_STRICT_MODE env: {TENANT_STRICT_MODE}")

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL unset — cannot run live backfill audit")
        print("\nOffline checklist:")
        print("  1. Run backfill for waves 1–5")
        print("  2. python scripts/create_indexes.py")
        print("  3. Re-run this script with MONGO_URL set")
        print("  4. Set TENANT_STRICT_MODE=true in deployment env")
        return 2

    from motor.motor_asyncio import AsyncIOMotorClient

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    db = AsyncIOMotorClient(mongo_url)[db_name]

    ready, gaps = await strict_mode_ready(db)
    print(f"Strict mode ready: {'YES' if ready else 'NO'}")
    if gaps:
        print("\nBlockers:")
        for gap in gaps:
            print(f"  - {gap}")

    ok, rows = await wave_coverage(db, WAVE_COLLECTIONS)
    print(f"\nAll wave collections backfilled: {'YES' if ok else 'NO'}")
    incomplete = [r for r in rows if r["total"] > 0 and not r["complete"]]
    if incomplete:
        print(format_coverage_lines(incomplete))

    audit = await build_isolation_report(db)
    missing_indexes = [
        r["collection"]
        for r in audit
        if r.get("index_expected") and r.get("index_exists") is False
    ]
    if missing_indexes:
        print(f"\nMissing tenant_id indexes ({len(missing_indexes)}):")
        for name in missing_indexes[:20]:
            print(f"  - {name}")
        if len(missing_indexes) > 20:
            print(f"  ... and {len(missing_indexes) - 20} more")

    if ready and not missing_indexes:
        print("\nCutover steps:")
        print("  1. Deploy with TENANT_STRICT_MODE=true")
        print("  2. Monitor 403/404 spikes on cross-tenant access attempts")
        print("  3. Run wave5_tenant_isolation_report.py post-cutover")
        return 0

    print("\nNot ready for TENANT_STRICT_MODE=true — resolve blockers above first.")
    return 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
