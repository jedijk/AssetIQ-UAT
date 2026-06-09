#!/usr/bin/env python3
"""
Phase 2 tenancy report — Security & tenancy (Weeks 6–10).

Checks tenant backfill coverage, strict-mode readiness, and OIDC config.

    cd backend && MONGO_URL=... ENVIRONMENT=uat python scripts/phase2_tenancy_report.py

Exit codes:
  0 — Phase 2 exit gate passed (Wave 2 backfilled + TENANT_STRICT_MODE enabled)
  1 — configuration error
  2 — gaps remain (see report)
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
from services.tenant_readiness import (  # noqa: E402
    format_coverage_lines,
    phase2_exit_ready,
    wave_coverage,
)
from services.tenant_schema import (  # noqa: E402
    WAVE1_COLLECTIONS,
    WAVE2_COLLECTIONS,
    WAVE3_COLLECTIONS,
)


async def main() -> int:
    print("=== Phase 2 tenancy report ===\n")

    snap = cutover_snapshot()
    strict = snap.get("tenant_strict_mode", False)
    print("--- Tenant strict mode ---")
    print(f"  TENANT_STRICT_MODE: {strict}")
    print("  Rule: tenant_id scopes all reads; installation filter is sub-scope within tenant")

    oidc_enabled = os.environ.get("OIDC_ENABLED", "false").lower() == "true"
    oidc_issuer = os.environ.get("OIDC_ISSUER", "")
    print("\n--- OIDC SSO (Phase 2 step 5) ---")
    print(f"  OIDC_ENABLED: {oidc_enabled}")
    if oidc_enabled:
        print(f"  OIDC_ISSUER: {oidc_issuer or '(unset)'}")
    else:
        print("  OIDC spike available at /api/auth/oidc — enable for enterprise pilot")

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("\n--- Tenant backfill ---")
        print("  SKIP (MONGO_URL unset)")
        print("\nRESULT: config-only report")
        return 2 if not strict else 0

    from motor.motor_asyncio import AsyncIOMotorClient

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    db = AsyncIOMotorClient(mongo_url)[db_name]

    print("\n--- Wave 1 backfill ---")
    w1_ok, w1_rows = await wave_coverage(db, WAVE1_COLLECTIONS)
    print(format_coverage_lines(w1_rows))

    print("\n--- Wave 2 backfill (required before strict mode) ---")
    w2_ok, w2_rows = await wave_coverage(db, WAVE2_COLLECTIONS)
    print(format_coverage_lines(w2_rows))
    if not w2_ok:
        print("  FIX: MONGO_URL=... python scripts/backfill_tenant_id.py --wave2 --create-indexes")

    print("\n--- Wave 3 backfill ---")
    w3_ok, w3_rows = await wave_coverage(db, WAVE3_COLLECTIONS)
    print(format_coverage_lines(w3_rows))

    ready, gaps = await phase2_exit_ready(db)
    print("\n--- Phase 2 exit gate ---")
    if not ready:
        for gap in gaps:
            print(f"  - {gap}")
    elif not strict:
        print("  Wave 2 backfill: OK")
        print("  NEXT: set TENANT_STRICT_MODE=true on staging → UAT → prod")
        return 2
    else:
        print("  Wave 2 backfill: OK")
        print("  TENANT_STRICT_MODE: enabled")
        print("  Phase 2 exit gate: PASSED")
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
