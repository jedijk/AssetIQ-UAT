#!/usr/bin/env python3
"""
Validate tenant onboarding against core collections.

Usage:
  python scripts/validate_tenant_onboarding.py [--tenant-id TENANT_ID] [--all]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


async def main() -> int:
    parser = argparse.ArgumentParser(description="Validate tenant onboarding")
    parser.add_argument("--tenant-id", help="Specific tenant_id to validate")
    parser.add_argument("--all", action="store_true", help="Validate all tenants")
    parser.add_argument("--include-archived", action="store_true")
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq")
    if not mongo_url:
        print("MONGO_URL is required", file=sys.stderr)
        return 1

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    from services.tenant_management_service import run_validation_checks

    tenant_ids = []
    if args.tenant_id:
        tenant_ids = [args.tenant_id]
    elif args.all:
        query = {} if args.include_archived else {"status": {"$ne": "archived"}}
        docs = await db.tenants.find(query, {"tenant_id": 1}).to_list(1000)
        tenant_ids = [d["tenant_id"] for d in docs]
    else:
        parser.print_help()
        return 1

    exit_code = 0
    reports = []
    for tenant_id in tenant_ids:
        report = await run_validation_checks(db, tenant_id)
        reports.append(report)
        print(json.dumps(report, indent=2))
        if report.get("overall") == "invalid":
            exit_code = 1
        elif report.get("overall") == "missing":
            exit_code = 1

    if len(reports) > 1:
        invalid = sum(1 for r in reports if r.get("overall") in ("invalid", "missing"))
        print(f"\nSummary: {len(reports)} tenant(s), {invalid} with errors")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
