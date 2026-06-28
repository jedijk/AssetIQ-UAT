#!/usr/bin/env python3
"""Run secure upload cleanup (temp + quarantine retention). Schedule hourly via cron/worker."""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET_KEY", "cleanup-script")
os.environ.setdefault("ENVIRONMENT", "test")


async def main() -> int:
    parser = argparse.ArgumentParser(description="Secure upload cleanup job")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--temp-hours", type=int, default=2)
    parser.add_argument("--quarantine-days", type=int, default=30)
    args = parser.parse_args()

    from workers.upload_cleanup import run_upload_cleanup

    stats = await run_upload_cleanup(
        temp_retention_hours=args.temp_hours,
        quarantine_retention_days=args.quarantine_days,
        dry_run=args.dry_run,
    )
    print(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
