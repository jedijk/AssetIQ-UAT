#!/usr/bin/env python3
"""
Backfill tenant_id on reliability_edges from linked equipment or source documents.

    cd backend && python scripts/backfill_reliability_edge_tenant.py
    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python scripts/backfill_reliability_edge_tenant.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))


async def main() -> int:
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 2

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    from motor.motor_asyncio import AsyncIOMotorClient

    import database

    client = AsyncIOMotorClient(mongo_url)
    database.db = client[db_name]
    db = database.db

    from services.reliability_graph import COLLECTION, ensure_reliability_graph_indexes

    await ensure_reliability_graph_indexes(db)

    equipment_tenant: dict[str, str] = {}
    async for eq in db.equipment_nodes.find({}, {"id": 1, "tenant_id": 1, "company_id": 1}):
        tid = eq.get("tenant_id") or eq.get("company_id")
        if eq.get("id") and tid:
            equipment_tenant[eq["id"]] = tid

    updated = 0
    skipped = 0
    cursor = db[COLLECTION].find({"tenant_id": {"$exists": False}}, {"_id": 1, "equipment_id": 1})
    async for edge in cursor:
        eq_id = edge.get("equipment_id")
        tid = equipment_tenant.get(eq_id) if eq_id else None
        if not tid:
            skipped += 1
            continue
        await db[COLLECTION].update_one(
            {"_id": edge["_id"]},
            {"$set": {"tenant_id": tid, "status": edge.get("status", "active")}},
        )
        updated += 1

    # Default status for edges missing it
    status_result = await db[COLLECTION].update_many(
        {"status": {"$exists": False}},
        {"$set": {"status": "active"}},
    )

    client.close()
    print(f"Backfill complete: tenant_id set on {updated} edges, skipped {skipped}")
    print(f"Status defaulted on {status_result.modified_count} edges")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
