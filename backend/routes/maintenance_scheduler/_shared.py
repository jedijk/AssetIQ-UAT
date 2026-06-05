"""
Shared helpers, models, and utilities for the maintenance scheduler module.
"""
import asyncio
import time
from typing import Dict, Optional, List
from pydantic import BaseModel

from models.maintenance_scheduler import TaskPriority
from services.scheduler_helpers import frequency_to_days, normalize_program_criticality

_PM_SYNC_LOCK = asyncio.Lock()
_PM_SYNC_LAST_AT: Dict[str, float] = {}
PM_SYNC_COOLDOWN_SECONDS = 120

class AIPlanRecommendation(BaseModel):
    task_id: str
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    planned_date: Optional[str] = None
    reasoning: Optional[str] = None


class ApplyAIPlanRequest(BaseModel):
    recommendations: List[AIPlanRecommendation]


# ---------- Helpers ----------

_PLANNING_HORIZON = {
    "high": 7,
    "medium": 14,
    "low": 30,
}


def get_planning_horizon(criticality: str) -> int:
    """Get planning horizon days based on criticality."""
    return _PLANNING_HORIZON.get(criticality, 14)


def calculate_priority(criticality: str, days_until_due: int, is_overdue: bool) -> TaskPriority:
    """Calculate task priority based on criticality and due date."""
    if is_overdue:
        if criticality == "high":
            return TaskPriority.CRITICAL
        return TaskPriority.HIGH

    if criticality == "high":
        if days_until_due <= 3:
            return TaskPriority.CRITICAL
        return TaskPriority.HIGH
    if criticality == "medium":
        if days_until_due <= 3:
            return TaskPriority.HIGH
        return TaskPriority.MEDIUM
    if days_until_due <= 3:
        return TaskPriority.MEDIUM
    return TaskPriority.LOW


async def ensure_imported_pm_tasks_scheduled(
    equipment_type_id: Optional[str] = None,
    *,
    schedule: bool = False,
    force: bool = False,
) -> None:
    """
    Sync accepted Custom PM Import program tasks into legacy maintenance_programs.

    Read endpoints call this with schedule=False and a cooldown so opening the schedule
    view does not regenerate a year of occurrences on every request.
    """
    from services.maintenance_program_service import MaintenanceProgramService

    cache_key = equipment_type_id or "__all__"
    now = time.monotonic()
    if not force and now - _PM_SYNC_LAST_AT.get(cache_key, 0) < PM_SYNC_COOLDOWN_SECONDS:
        return

    async with _PM_SYNC_LOCK:
        now = time.monotonic()
        if not force and now - _PM_SYNC_LAST_AT.get(cache_key, 0) < PM_SYNC_COOLDOWN_SECONDS:
            return
        _PM_SYNC_LAST_AT[cache_key] = now
        await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
            equipment_type_id=equipment_type_id,
            schedule=schedule,
        )
