#!/usr/bin/env python3
"""
Unified worker fleet — runs background jobs and projection/event processing.

Usage:
    cd backend && python scripts/run_worker_fleet.py
    cd backend && python scripts/run_worker_fleet.py --once
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import sys

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

logger = logging.getLogger("assetiq.worker_fleet")
_shutdown = False


def _handle_signal(signum, _frame):
    global _shutdown
    logger.info("shutdown signal received: %s", signum)
    _shutdown = True


async def _process_background_job() -> bool:
    from services.background_jobs import background_job_service
    from services.job_handlers import JOB_HANDLERS

    job = await background_job_service.claim_next_pending(list(JOB_HANDLERS.keys()))
    if not job:
        return False
    await background_job_service.run_claimed_job(job, JOB_HANDLERS)
    return True


async def run_fleet(poll_interval: float, once: bool) -> None:
    import database  # noqa: F401
    from workers.event_outbox_processor import process_outbox_batch

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    while not _shutdown:
        job_done = await _process_background_job()
        outbox_count = await process_outbox_batch(5)
        if once and not job_done and outbox_count == 0:
            break
        if not job_done and outbox_count == 0:
            await asyncio.sleep(poll_interval)

    logger.info("worker fleet stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="AssetIQ unified worker fleet")
    parser.add_argument("--poll-interval", type=float, default=float(os.getenv("WORKER_POLL_INTERVAL", "2")))
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_fleet(args.poll_interval, args.once))


if __name__ == "__main__":
    main()
