"""
Shared helpers, models, and utilities for the maintenance scheduler module.
"""
from typing import Dict, List, Optional
from pydantic import BaseModel

from services.maintenance_scheduler_scope import (
    PM_SYNC_COOLDOWN_SECONDS,
    calculate_priority,
    ensure_imported_pm_tasks_scheduled,
    frequency_to_days,
    get_planning_horizon,
    load_schedulable_program_rows,
    normalize_program_criticality,
    scheduler_scoped,
    scope_query_to_equipment_ids,
    scope_query_to_program_ids,
    scope_scheduled_tasks_query,
)

class AIPlanRecommendation(BaseModel):
    task_id: str
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    planned_date: Optional[str] = None
    reasoning: Optional[str] = None


class ApplyAIPlanRequest(BaseModel):
    recommendations: List[AIPlanRecommendation]


async def active_scheduler_program_ids(
    equipment_type_id: Optional[str] = None,
) -> List[str]:
    """Schedulable program ids (v2 task ids; legacy optional)."""
    rows = await load_schedulable_program_rows(equipment_type_id)
    return [row["id"] for row in rows if row.get("id")]


async def equipment_ids_with_active_programs(
    equipment_type_id: Optional[str] = None,
) -> List[str]:
    """Equipment ids with at least one schedulable program task."""
    rows = await load_schedulable_program_rows(equipment_type_id)
    seen: List[str] = []
    for row in rows:
        equipment_id = row.get("equipment_id")
        if equipment_id and equipment_id not in seen:
            seen.append(equipment_id)
    return seen
