#!/usr/bin/env python3
"""
Durable background job worker for AssetIQ.

Polls MongoDB ``background_jobs`` for pending work and executes registered
handlers. Run as a separate Railway service when the API process should not
own long-running Apply Strategy batches.

Set ``USE_EXTERNAL_BACKGROUND_WORKER=true`` on the API so async Apply Strategy
jobs are enqueued only (not executed in-process).

Optional ``WORKER_TENANT_ID`` scopes the worker to jobs for one tenant
(``company_id`` / ``organization_id`` on the job record). Leave unset to claim
jobs for all tenants.

Usage:
    cd backend && python scripts/run_background_worker.py
    cd backend && python scripts/run_background_worker.py --once
    cd backend && python scripts/run_background_worker.py --poll-interval 5
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import sys

# Ensure backend package root is importable when invoked as a script.
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from services.background_jobs import background_job_service
from services.job_handlers import JOB_HANDLERS

logger = logging.getLogger("assetiq.worker")
_shutdown = False


def _handle_signal(signum, _frame):
    global _shutdown
    logger.info("shutdown signal received: %s", signum)
    _shutdown = True


async def process_one() -> bool:
    job = await background_job_service.claim_next_pending(list(JOB_HANDLERS.keys()))
    if not job:
        return False
    logger.info(
        "claimed job",
        extra={"job_id": job.get("id"), "job_type": job.get("job_type")},
    )
    await background_job_service.run_claimed_job(job, JOB_HANDLERS)
    return True


async def run_loop(poll_interval: float, once: bool) -> None:
    import database  # noqa: F401 — ensures Mongo client is initialized

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    while not _shutdown:
        processed = await process_one()
        if once:
            break
        if not processed:
            await asyncio.sleep(poll_interval)

    logger.info("worker stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="AssetIQ background job worker")
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.getenv("BACKGROUND_WORKER_POLL_SECONDS", "3")),
        help="Seconds to wait when no pending jobs (default: 3)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process at most one job and exit",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    asyncio.run(run_loop(args.poll_interval, args.once))


if __name__ == "__main__":
    main()
