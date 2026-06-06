"""
Admin endpoints for task generation: manual trigger + run history.
The weekly cron in P3 will call the same bridge service.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from auth import get_current_user
from services.task_instance_bridge import sync_scheduled_tasks_to_instances, next_monday
from services.scheduler_job import (
    get_task_generation_config,
    save_task_generation_config,
    reload_task_generation_schedule,
    get_scheduler_status,
    compute_next_runs,
)

router = APIRouter(prefix="/admin/task-generation", tags=["admin", "task-generation"])


def _admin_only(current_user: dict):
    role = current_user.get("role")
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin role required")


class GenerateRequest(BaseModel):
    week_start: Optional[str] = None  # YYYY-MM-DD, defaults to next Monday
    look_ahead_days: int = 7  # 7-day window per the agreed plan
    dry_run: bool = False


@router.post("/run")
async def generate_tasks(
    payload: GenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Run the task generation bridge for a single week (manual trigger)."""
    _admin_only(current_user)
    if payload.week_start:
        try:
            start = datetime.fromisoformat(payload.week_start).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="week_start must be YYYY-MM-DD")
    else:
        start = next_monday()
    end = start + timedelta(days=max(1, min(payload.look_ahead_days, 60)))
    result = await sync_scheduled_tasks_to_instances(
        week_start=start,
        week_end=end,
        dry_run=payload.dry_run,
        triggered_by="manual",
        triggered_by_user_id=current_user.get("id") or current_user.get("user_id"),
    )
    return result


@router.get("/runs")
async def list_runs(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    """Return the most recent task_generation_runs entries."""
    _admin_only(current_user)
    cursor = (
        db.task_generation_runs.find({}, {"_id": 0})
        .sort("started_at", -1)
        .limit(max(1, min(limit, 200)))
    )
    runs = await cursor.to_list(limit)
    return {"runs": runs, "total": len(runs)}


# ---------- Schedule config + status ----------
class ScheduleUpdate(BaseModel):
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    look_ahead_days: Optional[int] = None
    enabled: Optional[bool] = None


@router.get("/schedule")
async def get_schedule(current_user: dict = Depends(get_current_user)):
    """Return the active cron config + next 3 fire times + scheduler health."""
    _admin_only(current_user)
    cfg = await get_task_generation_config()
    return {
        **cfg,
        "next_fire_times": compute_next_runs(cfg["cron_expression"], cfg["timezone"], n=3),
        "scheduler": get_scheduler_status(),
    }


@router.put("/schedule")
async def update_schedule(
    payload: ScheduleUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update the cron config and reload the scheduler in place."""
    _admin_only(current_user)
    try:
        merged = await save_task_generation_config(
            {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        )
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex))
    cfg = await reload_task_generation_schedule()
    return {
        **cfg,
        "next_fire_times": compute_next_runs(cfg["cron_expression"], cfg["timezone"], n=3),
        "scheduler": get_scheduler_status(),
        "saved": merged,
    }


@router.post("/schedule/preview")
async def preview_schedule(
    payload: ScheduleUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Compute the next 3 fire times for an unsaved cron+tz combo."""
    _admin_only(current_user)
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    from croniter import croniter

    cfg = await get_task_generation_config()
    cron_expression = payload.cron_expression or cfg["cron_expression"]
    timezone = payload.timezone or cfg["timezone"]
    try:
        ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail=f"Unknown timezone: {timezone}")
    try:
        croniter(cron_expression)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {ex}")
    return {
        "cron_expression": cron_expression,
        "timezone": timezone,
        "next_fire_times": compute_next_runs(cron_expression, timezone, n=3),
    }
