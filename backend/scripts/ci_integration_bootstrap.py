#!/usr/bin/env python3
"""Bootstrap Mongo fixtures for CI integration tests (auth + core flows)."""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from database import db  # noqa: E402


async def seed_ci_fixtures() -> dict:
    """Seed minimal tenant-scoped data for integration smoke tests."""
    now = datetime.now(timezone.utc).isoformat()
    equipment_id = "ci-equipment-001"
    threat_id = "ci-threat-001"

    await db.equipment_nodes.update_one(
        {"id": equipment_id},
        {
            "$set": {
                "id": equipment_id,
                "name": "CI Test Pump",
                "tag": "P-CI-001",
                "level": "equipment",
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    await db.threats.update_one(
        {"id": threat_id},
        {
            "$set": {
                "id": threat_id,
                "title": "CI Integration Threat",
                "status": "Open",
                "linked_equipment_id": equipment_id,
                "asset": "CI Test Pump",
                "risk_score": 55,
                "risk_level": "Medium",
                "created_by": "ci-bootstrap",
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    return {"equipment_id": equipment_id, "threat_id": threat_id}


async def main() -> int:
    if not os.environ.get("MONGO_URL"):
        print("MONGO_URL not set", file=sys.stderr)
        return 1
    result = await seed_ci_fixtures()
    print(f"CI integration fixtures ready: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
