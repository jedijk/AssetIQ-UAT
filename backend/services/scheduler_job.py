"""
APScheduler wrapper for the weekly task-generation cron.

The schedule is configurable from the Settings UI via the
`app_settings` collection (key: `task_generation`). When the user updates
the cron expression or timezone, `reload_task_generation_schedule()` is
called and the job is rescheduled in place.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from croniter import croniter
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from database import db
from services.task_instance_bridge import (
    sync_scheduled_tasks_to_instances,
    next_monday,
)

logger = logging.getLogger(__name__)

JOB_ID = "weekly_task_generation"

DEFAULT_CRON = "0 2 * * sun"          # Sunday 02:00 (unambiguous across cron flavours)
DEFAULT_TZ = "Europe/Amsterdam"      # Plant-local
DEFAULT_LOOK_AHEAD_DAYS = 7

# Singleton — initialized in FastAPI lifespan
_scheduler: Optional[AsyncIOScheduler] = None


async def get_task_generation_config() -> dict:
    """Read the current cron config from `app_settings`, falling back to defaults."""
    doc = await db.app_settings.find_one({"key": "task_generation"}, {"_id": 0})
    cfg = (doc or {}).get("value") or {}
    return {
        "enabled": cfg.get("enabled", True),
        "cron_expression": cfg.get("cron_expression") or DEFAULT_CRON,
        "timezone": cfg.get("timezone") or DEFAULT_TZ,
        "look_ahead_days": cfg.get("look_ahead_days") or DEFAULT_LOOK_AHEAD_DAYS,
    }


async def save_task_generation_config(cfg: dict) -> dict:
    """Persist a partial cron config update. Returns the merged saved config."""
    current = await get_task_generation_config()
    merged = {**current, **{k: v for k, v in cfg.items() if v is not None}}
    # Validate cron expression
    try:
        croniter(merged["cron_expression"])
    except Exception as ex:
        raise ValueError(f"Invalid cron expression: {ex}") from ex
    # Validate timezone
    try:
        ZoneInfo(merged["timezone"])
    except ZoneInfoNotFoundError as ex:
        raise ValueError(f"Unknown timezone: {merged['timezone']}") from ex
    await db.app_settings.update_one(
        {"key": "task_generation"},
        {"$set": {"key": "task_generation", "value": merged, "updated_at": datetime.utcnow()}},
        upsert=True,
    )
    return merged


def compute_next_runs(cron_expression: str, tz_name: str, n: int = 3) -> list:
    """Compute the next `n` fire times for a cron expression in a timezone."""
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)
    itr = croniter(cron_expression, now)
    out = []
    for _ in range(n):
        dt = itr.get_next(datetime)
        out.append(dt.astimezone(tz).isoformat())
    return out


async def _run_weekly_job():
    """Invoked by APScheduler. Computes next-Monday window and triggers the bridge."""
    from services.scheduler_leader import try_acquire_scheduler_leadership

    if not await try_acquire_scheduler_leadership():
        logger.info("weekly_task_generation skipped — not scheduler leader")
        return

    cfg = await get_task_generation_config()
    if not cfg["enabled"]:
        logger.info("weekly_task_generation skipped — disabled in settings")
        return
    start = next_monday()
    end = start + timedelta(days=int(cfg["look_ahead_days"]))
    logger.info("weekly_task_generation firing for %s..%s", start.date(), end.date())
    try:
        result = await sync_scheduled_tasks_to_instances(
            week_start=start,
            week_end=end,
            dry_run=False,
            triggered_by="cron",
        )
        logger.info(
            "weekly_task_generation done: created=%d skipped=%d errors=%d",
            result["created"], result["skipped"], len(result.get("errors") or []),
        )
    except Exception as ex:
        logger.exception("weekly_task_generation failed: %s", ex)


async def init_scheduler() -> AsyncIOScheduler:
    """Boot APScheduler and register the weekly job. Idempotent."""
    from services.scheduler_leader import api_scheduler_enabled

    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if not api_scheduler_enabled():
        logger.info("Task generation scheduler disabled (DISABLE_API_SCHEDULER)")
        return None  # type: ignore[return-value]
    cfg = await get_task_generation_config()
    sched = AsyncIOScheduler(timezone=ZoneInfo(cfg["timezone"]))
    sched.start()
    _scheduler = sched
    await _apply_job_from_config(cfg)
    logger.info(
        "Task generation scheduler started — cron='%s' tz=%s enabled=%s",
        cfg["cron_expression"], cfg["timezone"], cfg["enabled"],
    )
    return sched


async def _apply_job_from_config(cfg: dict):
    """(Re)register the job based on the supplied config."""
    if _scheduler is None:
        return
    # Remove previous job if any
    if _scheduler.get_job(JOB_ID):
        _scheduler.remove_job(JOB_ID)
    if not cfg["enabled"]:
        return
    try:
        tz = ZoneInfo(cfg["timezone"])
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    trigger = CronTrigger.from_crontab(cfg["cron_expression"], timezone=tz)
    _scheduler.add_job(
        _run_weekly_job,
        trigger=trigger,
        id=JOB_ID,
        replace_existing=True,
        misfire_grace_time=3600,  # 1h grace if backend was down at fire time
        coalesce=True,             # collapse multiple missed fires into one
    )


async def reload_task_generation_schedule() -> dict:
    """Pull latest config and reschedule the job. Returns the active config."""
    cfg = await get_task_generation_config()
    await _apply_job_from_config(cfg)
    logger.info(
        "Task generation schedule reloaded — cron='%s' tz=%s enabled=%s",
        cfg["cron_expression"], cfg["timezone"], cfg["enabled"],
    )
    return cfg


def get_scheduler_status() -> dict:
    """Return whether the scheduler is running and the next fire time."""
    if _scheduler is None:
        return {"running": False, "next_fire_time": None}
    job = _scheduler.get_job(JOB_ID)
    return {
        "running": _scheduler.running,
        "next_fire_time": job.next_run_time.isoformat() if job and job.next_run_time else None,
    }


async def shutdown_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
