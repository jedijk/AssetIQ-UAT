"""
Safe API startup lifecycle — idempotent checks only; no destructive mutations.

Destructive one-shot migrations and data deletes belong in scripts/run_startup_migrations.py
and are gated by RUN_STARTUP_MIGRATIONS=true (single-replica job only).
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable, Coroutine, Optional

logger = logging.getLogger(__name__)


def startup_migrations_enabled() -> bool:
    """When true, run legacy one-shot migrations (never on every API replica by default)."""
    return os.environ.get("RUN_STARTUP_MIGRATIONS", "").lower() in ("1", "true", "yes")


async def _run_step(label: str, coro_factory: Callable[[], Coroutine[Any, Any, Any]]) -> None:
    try:
        result = await coro_factory()
        if result is not None:
            logger.info("%s: %s", label, result)
        else:
            logger.info("%s: ok", label)
    except Exception as exc:
        logger.warning("%s skipped: %s", label, exc)


async def run_safe_startup(db, app) -> None:
    """Idempotent startup tasks safe for multi-instance deployment."""
    from database import verify_database_connection, client, AVAILABLE_DATABASES

    connected = await verify_database_connection(max_retries=3, timeout=5.0)
    if not connected:
        logger.warning("Database not connected - running in degraded mode")
        return

    logger.info("MongoDB connected successfully")
    app.state.ready = True

    await _run_step("Cutover config", _cutover_check)
    await _run_step("UAT owner bootstrap", lambda: _uat_owner(client, AVAILABLE_DATABASES))
    await _run_step("Mongo file storage", lambda: _mongo_storage(db))
    await _run_step("Database indexes", lambda: _create_indexes())
    await _run_step("Failure modes seed", lambda: _seed_failure_modes(db))
    await _run_step("Disciplines seed", _seed_disciplines)
    await _run_step("Task-generation scheduler", _init_scheduler)

    if startup_migrations_enabled():
        logger.warning(
            "RUN_STARTUP_MIGRATIONS=true — running legacy migrations (single-replica only)"
        )
        await _run_step("Startup migrations", lambda: _run_legacy_migrations(db))
    else:
        logger.info(
            "Startup migrations disabled (set RUN_STARTUP_MIGRATIONS=true on migration job to run)"
        )

    asyncio.create_task(_cleanup_pending_registrations_task(db))


async def _cutover_check() -> None:
    from services.cutover_config import cutover_gaps, cutover_snapshot

    snap = cutover_snapshot()
    logger.info("Cutover config snapshot: %s", snap)
    gaps = cutover_gaps()
    if gaps:
        logger.warning("90-day cutover gaps: %s", "; ".join(gaps))


async def _uat_owner(client, databases) -> None:
    from scripts.ensure_uat_owner import ensure_uat_primary_owner

    await ensure_uat_primary_owner(client, databases)


async def _mongo_storage(db) -> None:
    from services.storage_service import init_mongo_storage

    init_mongo_storage(db)


async def _create_indexes() -> None:
    from scripts.create_indexes import create_indexes

    created, skipped = await create_indexes()
    return f"{created} created, {skipped} skipped"


async def _seed_failure_modes(db) -> None:
    from scripts.seed_failure_modes import ensure_failure_modes_seeded

    await ensure_failure_modes_seeded(db)


async def _seed_disciplines() -> None:
    from services.discipline_seed import seed_disciplines_if_empty

    inserted = await seed_disciplines_if_empty()
    return f"{inserted} inserted" if inserted else "already populated"


async def _init_scheduler() -> None:
    from services.scheduler_job import init_scheduler

    await init_scheduler()


async def _run_legacy_migrations(db) -> None:
    from scripts.run_startup_migrations import run_startup_migrations

    await run_startup_migrations(db)


async def _cleanup_pending_registrations_task(db) -> None:
    """Periodically clean pending registrations older than 48 hours."""
    from datetime import datetime, timedelta, timezone

    cleanup_interval_hours = 6
    pending_expiry_hours = 48

    while True:
        try:
            await asyncio.sleep(cleanup_interval_hours * 3600)
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=pending_expiry_hours)
            cutoff_iso = cutoff_time.isoformat()
            result = await db.users.delete_many({
                "approval_status": "pending",
                "created_at": {"$lt": cutoff_iso},
            })
            if result.deleted_count > 0:
                logger.info(
                    "Cleaned up %s expired pending registrations",
                    result.deleted_count,
                )
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Pending registration cleanup error: %s", exc)
