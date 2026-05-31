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
