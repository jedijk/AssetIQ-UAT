#!/usr/bin/env python3
"""
Backfill legacy PM import disciplines (e.g. Mechanical → rotating).

Dry run (default):
    cd backend && MONGO_URL=... DB_NAME=assetiq python3 scripts/normalize_pm_import_disciplines.py

Apply:
    cd backend && MONGO_URL=... DB_NAME=assetiq python3 scripts/normalize_pm_import_disciplines.py --apply
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from motor.motor_asyncio import AsyncIOMotorClient

from services.normalize_pm_import_disciplines import normalize_pm_import_disciplines_backfill


async def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize PM import disciplines in existing data")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates (default is dry-run preview only)",
    )
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq").strip('"')
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 1

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result = await normalize_pm_import_disciplines_backfill(db, dry_run=not args.apply)

    mode = "DRY RUN" if result["dry_run"] else "APPLIED"
    print(f"[{mode}] PM import discipline backfill on {db_name}")
    for key in (
        "sessions_scanned",
        "sessions_updated",
        "session_tasks_updated",
        "programs_scanned",
        "programs_updated",
        "program_tasks_updated",
        "failure_modes_scanned",
        "failure_modes_updated",
    ):
        print(f"  {key}: {result[key]}")
    if result.get("samples"):
        print("  samples:")
        print(json.dumps(result["samples"], indent=2))
    if result["dry_run"]:
        print("  Pass --apply to persist changes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
