"""
Shared helpers, models, and utilities for the maintenance scheduler module.
"""
from typing import Optional, List
from pydantic import BaseModel

from models.maintenance_scheduler import TaskPriority


# ---------- Sub-router request/response models ----------

class AIPlanRecommendation(BaseModel):
    task_id: str
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    planned_date: Optional[str] = None
    reasoning: Optional[str] = None


class ApplyAIPlanRequest(BaseModel):
    recommendations: List[AIPlanRecommendation]


# ---------- Helpers ----------

_FREQUENCY_DAYS = {
    "continuous": 1,
    "daily": 1,
    "weekly": 7,
    "bi_weekly": 14,
    "monthly": 30,
    "quarterly": 90,
    "semi_annual": 180,
    "annual": 365,
    "biennial": 730,
    "on_condition": 30,  # Default to monthly check
}

_PLANNING_HORIZON = {
    "high": 7,
    "medium": 14,
    "low": 30,
}


def frequency_to_days(frequency: str) -> int:
    """Convert frequency string to days."""
    return _FREQUENCY_DAYS.get(frequency, 30)


def normalize_program_criticality(raw) -> str:
    """
    Map equipment / RPN criticality labels to program CriticalityLevel (high|medium|low).
    Unknown values default to low (longest interval).
    """
    if raw is None:
        return "low"
    if isinstance(raw, dict):
        level = raw.get("level") or raw.get("value") or raw.get("rating")
        if level is not None:
            raw = level
    label = str(raw).strip().lower().replace(" ", "_")
    if label in ("high", "medium", "low"):
        return label
    if label in (
        "critical",
        "very_high",
        "severe",
        "urgent",
        "safety_critical",
        "production_critical",
    ):
        return "high"
    if label in ("moderate", "normal", "average"):
        return "medium"
    return "low"


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
) -> None:
    """Sync accepted Custom PM Import program tasks into the scheduler."""
    from services.maintenance_program_service import MaintenanceProgramService

    await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
        equipment_type_id=equipment_type_id,
        schedule=True,
    )
