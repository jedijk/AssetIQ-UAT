#!/usr/bin/env python3
"""
Backfill tenant_id on wave collections for multi-tenant rollout.

For each document missing tenant_id:
  1. Resolve from created_by / user_id / owner_id user record (company_id / organization_id)
  2. Else apply BACKFILL_TENANT_ID when set (single-tenant migration)

Usage:
  MONGO_URL=... python scripts/backfill_tenant_id.py --dry-run
  MONGO_URL=... BACKFILL_TENANT_ID=co-default python scripts/backfill_tenant_id.py
  MONGO_URL=... python scripts/backfill_tenant_id.py --collections failure_modes,investigations
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any, Dict, List, Optional, Set

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import client, DEFAULT_DB_NAME  # noqa: E402
from services.tenant_schema import (  # noqa: E402
    DEFAULT_TENANT_FIELD,
    WAVE_COLLECTIONS,
    ensure_tenant_indexes,
    tenant_id_from_user,
)

USER_LOOKUP_FIELDS = ("created_by", "user_id", "owner_id", "created_by_id")


async def _resolve_tenant_for_doc(
    db,
    doc: Dict[str, Any],
    *,
    default_tid: Optional[str],
    user_cache: Dict[str, Optional[str]],
) -> Optional[str]:
    if doc.get(DEFAULT_TENANT_FIELD):
        return doc[DEFAULT_TENANT_FIELD]

    for field in USER_LOOKUP_FIELDS:
        uid = doc.get(field)
        if not uid:
            continue
        key = str(uid)
        if key not in user_cache:
            user = await db.users.find_one(
                {"id": key},
                {"_id": 0, "company_id": 1, "organization_id": 1},
            )
            user_cache[key] = tenant_id_from_user(user)
        if user_cache[key]:
            return user_cache[key]

    return default_tid


async def backfill_collection(
    db,
    name: str,
    *,
    default_tid: Optional[str],
    dry_run: bool,
    batch_size: int,
) -> Dict[str, int]:
    coll = db[name]
    user_cache: Dict[str, Optional[str]] = {}
    stats = {"scanned": 0, "updated": 0, "skipped": 0}

    cursor = coll.find(
        {DEFAULT_TENANT_FIELD: {"$exists": False}},
        {"_id": 1, **{f: 1 for f in USER_LOOKUP_FIELDS}},
    ).batch_size(batch_size)

    async for doc in cursor:
        stats["scanned"] += 1
        tid = await _resolve_tenant_for_doc(
            db, doc, default_tid=default_tid, user_cache=user_cache
        )
        if not tid:
            stats["skipped"] += 1
            continue
        stats["updated"] += 1
        if not dry_run:
            await coll.update_one(
                {"_id": doc["_id"]},
                {"$set": {DEFAULT_TENANT_FIELD: tid}},
            )

    return stats


async def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill tenant_id on wave collections")
    parser.add_argument(
        "--collections",
        default="",
        help="Comma-separated subset (default: all WAVE_COLLECTIONS)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report only; do not write")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument(
        "--create-indexes",
        action="store_true",
        help="Create {tenant_id:1} indexes before backfill",
    )
    args = parser.parse_args()

    default_tid = os.environ.get("BACKFILL_TENANT_ID") or None
    db_name = os.environ.get("DB_NAME", DEFAULT_DB_NAME)
    db = client[db_name]

    if args.collections.strip():
        names: Set[str] = {c.strip() for c in args.collections.split(",") if c.strip()}
        unknown = names - set(WAVE_COLLECTIONS)
        if unknown:
            print(f"Unknown collections (skipped): {sorted(unknown)}")
        names = names & set(WAVE_COLLECTIONS)
    else:
        names = set(WAVE_COLLECTIONS)

    print(f"Database: {db_name}")
    print(f"Collections: {sorted(names)}")
    print(f"Strict default tenant: {default_tid or '(none — user lookup only)'}")
    print(f"Dry run: {args.dry_run}")

    if args.create_indexes and not args.dry_run:
        n = ensure_tenant_indexes(db, frozenset(names))
        print(f"Ensured tenant_id indexes on {n} collection(s)")

    totals = {"scanned": 0, "updated": 0, "skipped": 0}
    for name in sorted(names):
        stats = await backfill_collection(
            db,
            name,
            default_tid=default_tid,
            dry_run=args.dry_run,
            batch_size=args.batch_size,
        )
        totals = {k: totals[k] + stats[k] for k in totals}
        print(
            f"  {name}: scanned={stats['scanned']} "
            f"updated={stats['updated']} skipped={stats['skipped']}"
        )

    print(
        f"Done: scanned={totals['scanned']} updated={totals['updated']} "
        f"skipped={totals['skipped']}"
    )
    if args.dry_run:
        print("Re-run without --dry-run to apply changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
