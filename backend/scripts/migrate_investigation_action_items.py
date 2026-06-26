#!/usr/bin/env python3
"""
Phase 1C — backfill investigation ``action_items`` into ``central_actions``.

    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python scripts/migrate_investigation_action_items.py --dry-run
    cd backend && MONGO_URL=... python scripts/migrate_investigation_action_items.py

Exit codes:
  0 — success (or dry-run preview only)
  1 — configuration error
  2 — errors during migration
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

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def migrate(*, dry_run: bool, purge_orphans: bool) -> int:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 1

    from services.investigation_action_bridge import upsert_central_from_action_item  # noqa: E402

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    inv_cache: dict = {}
    migrated = 0
    skipped = 0
    errors = 0

    async for item in db.action_items.find({}):
        action_id = item.get("id")
        inv_id = item.get("investigation_id")
        if not action_id or not inv_id:
            skipped += 1
            continue

        existing = await db.central_actions.find_one({"id": action_id}, {"_id": 1})
        if existing:
            skipped += 1
            continue

        if inv_id not in inv_cache:
            inv_cache[inv_id] = await db.investigations.find_one({"id": inv_id}, {"_id": 0})
        investigation = inv_cache[inv_id]
        if not investigation:
            print(f"  WARN: missing investigation {inv_id} for action {action_id}")
            if purge_orphans and not dry_run:
                await db.action_items.delete_one({"id": action_id})
                print(f"  PURGED orphan action_item {action_id}")
                migrated += 1
            else:
                errors += 1
            continue

        item.pop("_id", None)
        if dry_run:
            print(f"  would migrate {action_id} ({item.get('action_number')}) inv={inv_id}")
            migrated += 1
            continue

        try:
            await upsert_central_from_action_item(
                item,
                investigation,
                created_by=investigation.get("created_by"),
            )
            migrated += 1
        except Exception as exc:
            print(f"  ERROR {action_id}: {exc}")
            errors += 1

    label = "Would migrate" if dry_run else "Migrated"
    print(f"{label}: {migrated}, skipped (already present): {skipped}, errors: {errors}")
    return 2 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill action_items → central_actions")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument(
        "--purge-orphans",
        action="store_true",
        help="Delete action_items whose investigation no longer exists",
    )
    args = parser.parse_args()
    return asyncio.run(migrate(dry_run=args.dry_run, purge_orphans=args.purge_orphans))


if __name__ == "__main__":
    raise SystemExit(main())
