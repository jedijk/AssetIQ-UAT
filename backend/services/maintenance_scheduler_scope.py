"""Tenant-scoped query helpers for the maintenance scheduler."""
import asyncio
import time
from typing import Dict, List, Optional, Set

from services.tenant_schema import merge_tenant_filter
from services.scheduler_helpers import (
    frequency_to_days,
    normalize_program_criticality,
    get_planning_horizon,
    calculate_priority,
)

_PM_SYNC_LOCK = asyncio.Lock()
_PM_SYNC_LAST_AT: Dict[str, float] = {}
PM_SYNC_COOLDOWN_SECONDS = 600


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


async def load_schedulable_program_rows(
    equipment_type_id: Optional[str] = None,
) -> List[dict]:
    from services.scheduler_program_source import load_schedulable_programs

    return await load_schedulable_programs(equipment_type_id=equipment_type_id)


def scope_query_to_program_ids(query: Dict, program_ids: List[str]) -> None:
    query["maintenance_program_id"] = {"$in": program_ids} if program_ids else {"$in": []}


def scope_query_to_equipment_ids(query: Dict, equipment_ids: List[str]) -> None:
    query["equipment_id"] = {"$in": equipment_ids} if equipment_ids else {"$in": []}


def scheduler_scoped(user: Optional[dict], query: Dict) -> Dict:
    if not user:
        return query
    return merge_tenant_filter(query, user)


async def scope_scheduled_tasks_query(
    query: Dict,
    equipment_type_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> None:
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
    if user:
        scoped = scheduler_scoped(user, query)
        query.clear()
        query.update(scoped)


# Re-export scheduler helper symbols used by route _shared consumers.
__all__ = [
    "PM_SYNC_COOLDOWN_SECONDS",
    "calculate_priority",
    "ensure_imported_pm_tasks_scheduled",
    "frequency_to_days",
    "get_planning_horizon",
    "load_schedulable_program_rows",
    "normalize_program_criticality",
    "scheduler_scoped",
    "scope_query_to_equipment_ids",
    "scope_query_to_program_ids",
    "scope_scheduled_tasks_query",
]
