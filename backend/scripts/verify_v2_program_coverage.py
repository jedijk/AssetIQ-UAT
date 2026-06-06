#!/usr/bin/env python3
"""
Verify maintenance_programs_v2 coverage vs legacy flat rows.

Run before disabling READ_LEGACY_MAINTENANCE_PROGRAMS in production.
"""
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient


async def main() -> int:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 1

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    legacy_active = await db.maintenance_programs.count_documents({"is_active": True})
    v2_count = await db.maintenance_programs_v2.count_documents({})

    legacy_equipment = set()
    async for doc in db.maintenance_programs.find({"is_active": True}, {"equipment_id": 1}):
        if doc.get("equipment_id"):
            legacy_equipment.add(doc["equipment_id"])

    v2_equipment = set()
    async for doc in db.maintenance_programs_v2.find({}, {"equipment_id": 1}):
        if doc.get("equipment_id"):
            v2_equipment.add(doc["equipment_id"])

    missing_v2 = legacy_equipment - v2_equipment
    print(f"Legacy active programs: {legacy_active}")
    print(f"V2 program documents: {v2_count}")
    print(f"Equipment with legacy only (no v2 doc): {len(missing_v2)}")
    if missing_v2:
        print("Sample equipment_ids missing v2:", list(missing_v2)[:20])
        return 2
    print("OK: all legacy equipment have v2 program documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
