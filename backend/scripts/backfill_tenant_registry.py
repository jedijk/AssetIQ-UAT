#!/usr/bin/env python3
"""
Register legacy tenants (e.g. Tyromer) in the tenants collection from existing user data.

Usage:
  MONGO_URL=... DB_NAME=assetiq-UAT python scripts/backfill_tenant_registry.py --dry-run
  MONGO_URL=... DB_NAME=assetiq-UAT python scripts/backfill_tenant_registry.py --execute
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db  # noqa: E402
from services.tenant_management_service import (  # noqa: E402
    build_legacy_tenant_snapshot,
    discover_legacy_tenant_ids,
    register_legacy_tenant,
)


async def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill tenants registry from legacy data")
    parser.add_argument("--dry-run", action="store_true", help="List tenants that would be registered")
    parser.add_argument("--execute", action="store_true", help="Insert registry records")
    args = parser.parse_args()

    if not args.dry_run and not args.execute:
        parser.error("Specify --dry-run or --execute")

    legacy_ids = await discover_legacy_tenant_ids(db)
    if not legacy_ids:
        print("No legacy tenants to register.")
        return 0

    print(f"Found {len(legacy_ids)} legacy tenant(s): {', '.join(legacy_ids)}")
    for tenant_id in legacy_ids:
        snapshot = await build_legacy_tenant_snapshot(db, tenant_id)
        counts = {
            "users": snapshot.get("user_count"),
            "admin": (snapshot.get("primary_admin") or {}).get("email"),
        }
        print(f"  - {tenant_id}: admin={counts['admin']}")

        if args.execute:
            actor = {"id": "system-backfill", "email": "system@assetiq.local", "role": "owner"}
            await register_legacy_tenant(db, tenant_id, actor)
            print(f"    registered {tenant_id}")

    if args.dry_run:
        print("\nDry run — re-run with --execute to register.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
