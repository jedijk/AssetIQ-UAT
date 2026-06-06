#!/usr/bin/env python3
"""
Verify maintenance schedule drift vs active strategies (UAT / prod gate).

Run before confirming zero-drift success criteria:
    cd backend && python scripts/verify_schedule_drift.py

Exit codes:
  0 — no blocking drift detected
  1 — configuration error
  2 — drift or coverage issues found
"""
from __future__ import annotations

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

    strategies = await db.equipment_type_strategies.find(
        {"status": "active"}, {"_id": 0}
    ).to_list(500)

    issues: list[str] = []
    summary = {
        "active_strategies": len(strategies),
        "needs_apply_flags": 0,
        "version_drift_programs": 0,
        "equipment_without_v2": 0,
        "open_scheduled_tasks": 0,
    }

    for strategy in strategies:
        et_id = strategy.get("equipment_type_id")
        if not et_id:
            continue

        if strategy.get("strategy_needs_apply"):
            summary["needs_apply_flags"] += 1
            issues.append(f"{et_id}: strategy_needs_apply=true")

        strategy_version = strategy.get("version")
        if strategy_version:
            drift_count = await db.maintenance_programs_v2.count_documents(
                {
                    "equipment_type_id": et_id,
                    "strategy_tasks": {"$gt": 0},
                    "$or": [
                        {"source_strategy_version": {"$ne": strategy_version}},
                        {"source_strategy_version": None},
                    ],
                }
            )
            if drift_count:
                summary["version_drift_programs"] += drift_count
                issues.append(
                    f"{et_id}: {drift_count} v2 program(s) on stale strategy version"
                )

        equipment_ids = await db.equipment_nodes.distinct(
            "id",
            {"equipment_type_id": et_id, "level": {"$in": ["equipment_unit", "equipment", "subunit", "maintainable_item"]}},
        )
        if not equipment_ids:
            continue

        v2_equipment = set(
            await db.maintenance_programs_v2.distinct(
                "equipment_id",
                {"equipment_type_id": et_id, "is_active": {"$ne": False}},
            )
        )
        missing_v2 = [eid for eid in equipment_ids if eid not in v2_equipment]
        if missing_v2:
            summary["equipment_without_v2"] += len(missing_v2)
            issues.append(
                f"{et_id}: {len(missing_v2)} equipment missing v2 program "
                f"(sample: {missing_v2[:5]})"
            )

    summary["open_scheduled_tasks"] = await db.scheduled_tasks.count_documents(
        {"status": {"$nin": ["completed", "cancelled"]}}
    )

    print("=== Schedule drift report ===")
    for key, value in summary.items():
        print(f"  {key}: {value}")

    if issues:
        print("\nIssues:")
        for line in issues[:50]:
            print(f"  - {line}")
        if len(issues) > 50:
            print(f"  ... and {len(issues) - 50} more")
        return 2

    print("\nOK: no blocking strategy/program drift detected")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
