#!/usr/bin/env python3
"""
Run reliability snapshot materialization (DT-1).

One-off or cron entrypoint for Railway / local:

    cd backend && python scripts/run_reliability_snapshot_refresh.py
    cd backend && MONGO_URL=... DB_NAME=assetiq python scripts/run_reliability_snapshot_refresh.py --equipment-id eq-123

Enqueue as background job (requires worker):

    cd backend && python -c "
import asyncio
from services.background_jobs import background_job_service
async def main():
    jid = await background_job_service.create_record('reliability_snapshots_daily_refresh', payload={})
    print('enqueued', jid)
asyncio.run(main())
"
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Materialize reliability_snapshots")
    parser.add_argument("--equipment-id", dest="equipment_id", default=None)
    parser.add_argument("--enqueue", action="store_true", help="Enqueue background job instead of inline run")
    return parser.parse_args()


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL required", file=sys.stderr)
        return 2

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    from motor.motor_asyncio import AsyncIOMotorClient

    import database

    client = AsyncIOMotorClient(mongo_url)
    database.db = client[db_name]

    equipment_ids = [args.equipment_id] if args.equipment_id else None
    payload = {"equipment_ids": equipment_ids} if equipment_ids else {}

    if args.enqueue:
        from services.background_jobs import background_job_service

        job_id = await background_job_service.create_record(
            "reliability_snapshots_daily_refresh",
            payload=payload,
        )
        print(f"Enqueued reliability_snapshots_daily_refresh job_id={job_id}")
        client.close()
        return 0

    from services.reliability_snapshot_service import refresh_reliability_snapshots

    result = await refresh_reliability_snapshots(equipment_ids=equipment_ids)
    print(f"Done: upserted={result['upserted']} snapshot_at={result['snapshot_at']}")
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
