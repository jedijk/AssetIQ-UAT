"""
Standalone domain event outbox consumer.

Run: ``cd backend && python -m workers.outbox_worker``

Set ``OUTBOX_WORKER_EXTERNAL=true`` on API processes to skip the in-process loop.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal

from workers.event_outbox_processor import process_outbox_batch

logger = logging.getLogger("assetiq.workers.outbox")

POLL_INTERVAL_SEC = float(os.environ.get("OUTBOX_POLL_INTERVAL_SEC", "2"))
BATCH_SIZE = int(os.environ.get("OUTBOX_BATCH_SIZE", "10"))


async def run_outbox_loop(*, once: bool = False) -> None:
    """Poll and process pending outbox events until cancelled or ``once`` completes."""
    from database import verify_database_connection

    connected = await verify_database_connection(max_retries=5, timeout=5.0)
    if not connected:
        logger.error("MongoDB unavailable — outbox worker exiting")
        return

    logger.info(
        "Outbox worker started (batch=%s, interval=%ss, once=%s)",
        BATCH_SIZE,
        POLL_INTERVAL_SEC,
        once,
    )
    while True:
        try:
            processed = await process_outbox_batch(BATCH_SIZE)
            if processed:
                logger.info("Processed %s outbox event(s)", processed)
            if once and processed == 0:
                break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Outbox batch failed: %s", exc)
        if once:
            break
        await asyncio.sleep(POLL_INTERVAL_SEC)


def _parse_once_flag() -> bool:
    return os.environ.get("OUTBOX_WORKER_ONCE", "").lower() in ("1", "true", "yes")


async def _main() -> None:
    once = _parse_once_flag()
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    def _request_stop(*_args):
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            pass

    worker_task = asyncio.create_task(run_outbox_loop(once=once))
    await stop.wait()
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    logger.info("Outbox worker stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
