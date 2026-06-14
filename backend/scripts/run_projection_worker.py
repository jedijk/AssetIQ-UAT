#!/usr/bin/env python3
"""
Projection worker — processes domain event outbox and materialized read models.

Run separately from the API process for Wave 3 worker fleet architecture:

    cd backend && python scripts/run_projection_worker.py
    cd backend && python scripts/run_projection_worker.py --once
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

from workers.event_outbox_processor import process_outbox_batch

logger = logging.getLogger("assetiq.projection_worker")
_shutdown = False


def _handle_signal(signum, _frame):
    global _shutdown
    logger.info("shutdown signal received: %s", signum)
    _shutdown = True


async def run_loop(poll_interval: float, batch_size: int, once: bool) -> None:
    import database  # noqa: F401

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    while not _shutdown:
        processed = await process_outbox_batch(batch_size)
        if processed:
            from services.observability_metrics import inc

            inc("outbox_processed_total", processed)
            logger.info("processed %s outbox event(s)", processed)
        if once:
            break
        if not processed:
            await asyncio.sleep(poll_interval)

    logger.info("projection worker stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="AssetIQ projection / event outbox worker")
    parser.add_argument("--poll-interval", type=float, default=float(os.getenv("PROJECTION_POLL_INTERVAL", "2")))
    parser.add_argument("--batch-size", type=int, default=int(os.getenv("PROJECTION_BATCH_SIZE", "10")))
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_loop(args.poll_interval, args.batch_size, args.once))


if __name__ == "__main__":
    main()
