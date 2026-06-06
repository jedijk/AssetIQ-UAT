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
