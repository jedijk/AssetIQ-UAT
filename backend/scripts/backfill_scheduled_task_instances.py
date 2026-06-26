#!/usr/bin/env python3
"""
Phase 1A — bridge all open scheduled_tasks that lack a task_instance row.

    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/backfill_scheduled_task_instances.py --dry-run
    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python3 scripts/backfill_scheduled_task_instances.py

Exit codes:
  0 — success (or dry-run preview)
  1 — configuration error
  2 — errors during backfill
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))


async def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill task_instances for unbridged scheduled_tasks")
    parser.add_argument("--dry-run", action="store_true", help="Preview only; do not insert")
    parser.add_argument("--limit", type=int, default=None, help="Max instances to create")
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 1

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    os.environ.setdefault("JWT_SECRET_KEY", "backfill-script")
    os.environ.setdefault("REQUIRE_JWT_SECRET_KEY", "false")

    from motor.motor_asyncio import AsyncIOMotorClient
    import database

    client = AsyncIOMotorClient(mongo_url)
    database.db = client[db_name]

    from services.task_instance_bridge import sync_all_unbridged_scheduled_tasks

    print("=== Phase 1A: scheduled_task → task_instance backfill ===\n")
    result = await sync_all_unbridged_scheduled_tasks(
        dry_run=args.dry_run,
        triggered_by="phase1_backfill",
        limit=args.limit,
    )

    print(f"  Candidates (unbridged open): {result.get('candidates', 0)}")
    print(f"  Created: {result.get('created', 0)}")
    print(f"  Skipped (already bridged): {result.get('skipped', 0)}")
    print(f"  Errors: {len(result.get('errors') or [])}")
    for err in (result.get("errors") or [])[:10]:
        print(f"    - {err}")

    client.close()

    if result.get("errors"):
        return 2
    if args.dry_run:
        print("\nDRY RUN — no documents inserted")
    else:
        print("\nBackfill complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
