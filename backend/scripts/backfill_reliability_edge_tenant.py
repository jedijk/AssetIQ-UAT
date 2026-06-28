#!/usr/bin/env python3
"""
Backfill tenant_id on reliability_edges from linked equipment, entities, or endpoints.

    cd backend && python scripts/backfill_reliability_edge_tenant.py
    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python scripts/backfill_reliability_edge_tenant.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

ENTITY_COLLECTIONS = {
    "equipment": "equipment_nodes",
    "equipment_node": "equipment_nodes",
    "observation": "observations",
    "threat": "threats",
    "action": "central_actions",
    "central_action": "central_actions",
    "scheduled_task": "scheduled_tasks",
    "task_instance": "task_instances",
    "program_task": "scheduled_tasks",
    "form": "form_templates",
    "form_template": "form_templates",
    "spare_part": "spare_parts",
}


def _tenant_from_doc(doc: Optional[dict]) -> Optional[str]:
    if not doc:
        return None
    return doc.get("tenant_id") or doc.get("company_id")


async def _build_tenant_lookup(db) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    async for eq in db.equipment_nodes.find({}, {"id": 1, "tenant_id": 1, "company_id": 1}):
        tid = _tenant_from_doc(eq)
        if eq.get("id") and tid:
            lookup[f"equipment:{eq['id']}"] = tid
            lookup[f"equipment_node:{eq['id']}"] = tid

    for entity_type, collection in ENTITY_COLLECTIONS.items():
        if collection == "equipment_nodes":
            continue
        async for doc in db[collection].find({}, {"id": 1, "tenant_id": 1, "company_id": 1}):
            tid = _tenant_from_doc(doc)
            if doc.get("id") and tid:
                lookup[f"{entity_type}:{doc['id']}"] = tid
    return lookup


def _resolve_edge_tenant(edge: dict, lookup: Dict[str, str]) -> Optional[str]:
    eq_id = edge.get("equipment_id")
    if eq_id:
        tid = lookup.get(f"equipment:{eq_id}") or lookup.get(f"equipment_node:{eq_id}")
        if tid:
            return tid

    for prefix, id_key in (("source", "source_id"), ("target", "target_id")):
        entity_type = edge.get(f"{prefix}_type")
        entity_id = edge.get(id_key)
        if entity_type and entity_id:
            tid = lookup.get(f"{entity_type}:{entity_id}")
            if tid:
                return tid
    return None


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
    lookup = await _build_tenant_lookup(db)

    missing_query: Dict[str, Any] = {
        "$or": [
            {"tenant_id": {"$exists": False}},
            {"tenant_id": None},
            {"tenant_id": ""},
        ]
    }
    before = await db[COLLECTION].count_documents(missing_query)

    updated = 0
    skipped = 0
    cursor = db[COLLECTION].find(missing_query, {"_id": 1, "equipment_id": 1, "source_type": 1, "source_id": 1, "target_type": 1, "target_id": 1, "status": 1})
    async for edge in cursor:
        tid = _resolve_edge_tenant(edge, lookup)
        if not tid:
            skipped += 1
            continue
        await db[COLLECTION].update_one(
            {"_id": edge["_id"]},
            {"$set": {"tenant_id": tid, "status": edge.get("status") or "active"}},
        )
        updated += 1

    status_result = await db[COLLECTION].update_many(
        {"status": {"$exists": False}},
        {"$set": {"status": "active"}},
    )
    after = await db[COLLECTION].count_documents(missing_query)

    client.close()
    print(f"Edges missing tenant_id before: {before}")
    print(f"Backfill complete: tenant_id set on {updated} edges, skipped {skipped}")
    print(f"Status defaulted on {status_result.modified_count} edges")
    print(f"Edges missing tenant_id after: {after}")
    return 1 if after > 0 and skipped > 0 else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
