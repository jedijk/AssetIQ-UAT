#!/usr/bin/env python3
"""
Backfill company_id (and tenant_id when missing) on all user records.

New documents resolve tenant_id via tenant_id_from_user() which reads company_id
or organization_id from the authenticated user.

Usage:
  MONGO_URL=... DB_NAME=assetiq-UAT COMPANY_ID=Tyromer python scripts/backfill_user_company_id.py --dry-run
  MONGO_URL=... DB_NAME=assetiq-UAT COMPANY_ID=Tyromer python scripts/backfill_user_company_id.py
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import client, DEFAULT_DB_NAME  # noqa: E402
from services.tenant_schema import DEFAULT_TENANT_FIELD  # noqa: E402


async def backfill_users(*, db_name: str, company_id: str, dry_run: bool) -> None:
    db = client[db_name]
    total = await db.users.count_documents({})
    missing_company = await db.users.count_documents(
        {"$or": [{"company_id": {"$exists": False}}, {"company_id": None}, {"company_id": ""}]}
    )
    print(f"Database: {db_name}")
    print(f"Users total: {total}")
    print(f"Users missing company_id: {missing_company}")
    print(f"Target company_id: {company_id!r}")

    if dry_run:
        sample = await db.users.find_one(
            {"$or": [{"company_id": {"$exists": False}}, {"company_id": None}, {"company_id": ""}]},
            {"_id": 0, "id": 1, "email": 1, "company_id": 1, DEFAULT_TENANT_FIELD: 1},
        )
        print(f"Dry run — would update {total} users (sample missing: {sample})")
        return

    result = await db.users.update_many({}, {"$set": {"company_id": company_id}})
    # Also ensure tenant_id is set when absent (keep existing tenant_id values).
    tid_result = await db.users.update_many(
        {DEFAULT_TENANT_FIELD: {"$exists": False}},
        {"$set": {DEFAULT_TENANT_FIELD: company_id}},
    )
    tid_null = await db.users.update_many(
        {DEFAULT_TENANT_FIELD: None},
        {"$set": {DEFAULT_TENANT_FIELD: company_id}},
    )

    with_company = await db.users.count_documents({"company_id": company_id})
    print(f"Updated company_id on {result.modified_count} users (matched {result.matched_count})")
    print(f"Set missing tenant_id on {tid_result.modified_count + tid_null.modified_count} users")
    print(f"Users with company_id={company_id!r}: {with_company}/{total}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill company_id on all users")
    parser.add_argument("--dry-run", action="store_true", help="Report only, do not write")
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", DEFAULT_DB_NAME))
    parser.add_argument(
        "--company-id",
        default=os.environ.get("COMPANY_ID") or os.environ.get("BACKFILL_TENANT_ID"),
        help="company_id value to set (default: COMPANY_ID or BACKFILL_TENANT_ID env)",
    )
    args = parser.parse_args()

    if not args.company_id:
        print("Error: set COMPANY_ID or BACKFILL_TENANT_ID, or pass --company-id", file=sys.stderr)
        sys.exit(1)

    asyncio.run(
        backfill_users(db_name=args.db_name, company_id=args.company_id, dry_run=args.dry_run)
    )


if __name__ == "__main__":
    main()
