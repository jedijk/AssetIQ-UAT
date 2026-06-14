#!/usr/bin/env python3
"""
One-shot startup migrations — run on a single replica or as a deploy job.

    cd backend && RUN_STARTUP_MIGRATIONS=true MONGO_URL=... python scripts/run_startup_migrations.py

Do NOT enable RUN_STARTUP_MIGRATIONS on every API instance in production.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

logger = logging.getLogger(__name__)


async def run_startup_migrations(db) -> dict:
    """Run idempotent legacy migrations and one-shot cleanups."""
    stats = {}

    try:
        from scripts.migrate_observation_statuses import migrate_observation_statuses

        stats["observation_statuses"] = await migrate_observation_statuses(db)
    except Exception as exc:
        logger.warning("Observation status migration failed: %s", exc)

    try:
        from scripts.backfill_action_disciplines import backfill_action_disciplines

        stats["action_disciplines"] = await backfill_action_disciplines(db)
    except Exception as exc:
        logger.warning("Action discipline backfill failed: %s", exc)

    try:
        from scripts.migrations.cleanup_legacy_investigation_actions import (
            cleanup_legacy_investigation_actions,
        )

        stats["legacy_investigation_actions"] = await cleanup_legacy_investigation_actions(db)
    except Exception as exc:
        logger.warning("Legacy investigation-action cleanup failed: %s", exc)

    return stats


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
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

    stats = await run_startup_migrations(db)
    print("Startup migrations complete:", stats)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
