"""
Shared helpers, models, and utilities for the maintenance scheduler module.
"""
import asyncio
import time
from typing import Dict, Optional, List, Set
from pydantic import BaseModel

from models.maintenance_scheduler import TaskPriority
from database import db
from services.scheduler_helpers import (
    frequency_to_days,
    normalize_program_criticality,
    get_planning_horizon,
    calculate_priority,
)

_PM_SYNC_LOCK = asyncio.Lock()
_PM_SYNC_LAST_AT: Dict[str, float] = {}
PM_SYNC_COOLDOWN_SECONDS = 600

class AIPlanRecommendation(BaseModel):
    task_id: str
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    planned_date: Optional[str] = None
    reasoning: Optional[str] = None


class ApplyAIPlanRequest(BaseModel):
    recommendations: List[AIPlanRecommendation]


# ---------- Helpers ----------

# Re-exported from services.scheduler_helpers for route-layer backward compatibility.


async def ensure_imported_pm_tasks_scheduled(
    equipment_type_id: Optional[str] = None,
    *,
    schedule: bool = True,
    force: bool = False,
    read_only: bool = False,
) -> None:
    """
    Sync accepted Custom PM Import program tasks into legacy maintenance_programs
    and generate scheduled occurrences (cooldown-limited on read endpoints).

    On read-only GET handlers: skip unscoped (all-equipment) sync, never schedule
    occurrences, and rely on explicit Run Scheduler / apply-strategy for generation.
    """
    if read_only:
        if not equipment_type_id:
            return
        schedule = False

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


async def load_schedulable_program_rows(
    equipment_type_id: Optional[str] = None,
) -> List[dict]:
    from services.scheduler_program_source import load_schedulable_programs

    return await load_schedulable_programs(equipment_type_id=equipment_type_id)


def scope_query_to_program_ids(query: Dict, program_ids: List[str]) -> None:
    """Restrict a scheduled_tasks query to specific maintenance programs."""
    query["maintenance_program_id"] = {"$in": program_ids} if program_ids else {"$in": []}


def scope_query_to_equipment_ids(query: Dict, equipment_ids: List[str]) -> None:
    """Restrict a scheduled_tasks query to specific equipment ids."""
    query["equipment_id"] = {"$in": equipment_ids} if equipment_ids else {"$in": []}


async def scope_scheduled_tasks_query(
    query: Dict,
    equipment_type_id: Optional[str] = None,
) -> None:
    """
    Only include scheduled tasks for equipment that has active maintenance programs,
    and only via those active programs.
    """
    rows = await load_schedulable_program_rows(equipment_type_id)
    program_ids = [row["id"] for row in rows if row.get("id")]
    equipped_ids: List[str] = []
    seen: Set[str] = set()
    for row in rows:
        equipment_id = row.get("equipment_id")
        if equipment_id and equipment_id not in seen:
            seen.add(equipment_id)
            equipped_ids.append(equipment_id)
    scope_query_to_program_ids(query, program_ids)
    scope_query_to_equipment_ids(query, equipped_ids)
