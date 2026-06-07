#!/usr/bin/env python3
"""
One-off: cancel overdue work items that appear in My Tasks.

Dry run (default):
    cd backend && MONGO_URL=... DB_NAME=assetiq python3 scripts/flush_my_tasks_overdue.py

Apply:
    cd backend && MONGO_URL=... DB_NAME=assetiq python3 scripts/flush_my_tasks_overdue.py --apply

Optional:
    --tenant-id <id>       scope to one tenant
    --skip-actions         leave central_actions unchanged
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from motor.motor_asyncio import AsyncIOMotorClient

from services.flush_my_tasks_overdue import flush_overdue_my_tasks_backlog


async def main() -> int:
    parser = argparse.ArgumentParser(description="Flush overdue My Tasks backlog")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply cancellations (default is dry-run preview only)",
    )
    parser.add_argument("--tenant-id", default=os.environ.get("TENANT_ID"))
    parser.add_argument(
        "--skip-actions",
        action="store_true",
        help="Do not cancel overdue central_actions",
    )
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq").strip('"')
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 1

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result = await flush_overdue_my_tasks_backlog(
        db,
        dry_run=not args.apply,
        tenant_id=args.tenant_id,
        include_actions=not args.skip_actions,
    )

    mode = "DRY RUN" if result["dry_run"] else "APPLIED"
    print(f"[{mode}] overdue My Tasks backlog on {db_name}")
    print(f"  counts_before: {result['counts_before']}")
    if not result["dry_run"]:
        print(f"  modified:      {result['modified']}")
        print(f"  counts_after:  {result['counts_after']}")
    else:
        print("  Pass --apply to cancel these rows.")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
