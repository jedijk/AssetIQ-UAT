"""Helpers for showing program-disabled tasks on the maintenance schedule."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from services.maintenance_tenant_scope import maintenance_scoped, maintenance_scoped_job

from services.pm_import_constants import (
    is_pm_import_review_accepted,
    normalize_pm_import_display_status,
)

INCORPORATED_PM_IMPORT_STATUSES = frozenset({"merged", "applied"})

PROGRAM_DISABLE_CANCEL_NOTES = frozenset(
    {
        "Auto-cancelled: maintenance program task removed or deactivated",
        "Auto-cancelled: PM import task disabled",
    }
)

ProgramTaskKey = Tuple[str, str]


def scheduled_task_program_keys(task: Dict[str, Any]) -> List[ProgramTaskKey]:
    """Candidate (equipment_id, task_ref) pairs for matching a scheduled row to a program task."""
    equipment_id = task.get("equipment_id")
    if not equipment_id:
        return []

    keys: List[ProgramTaskKey] = []
    seen: Set[ProgramTaskKey] = set()
    for field in (
        "v2_task_id",
        "program_task_id",
        "pm_import_task_id",
        "maintenance_program_id",
    ):
        value = task.get(field)
        if not value:
            continue
        key = (equipment_id, str(value))
        if key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def task_disabled_in_program(
    task: Dict[str, Any],
    inactive_keys: Set[ProgramTaskKey],
) -> bool:
    if (task.get("notes") or "") in PROGRAM_DISABLE_CANCEL_NOTES:
        return True
    return any(key in inactive_keys for key in scheduled_task_program_keys(task))


async def load_inactive_program_task_keys(
    equipment_ids: List[str],
    *,
    user: Optional[dict] = None,
) -> Set[ProgramTaskKey]:
    """Program tasks currently disabled for the given equipment ids."""
    from database import db

    if not equipment_ids:
        return set()

    scope = (lambda q: maintenance_scoped(user, q)) if user else maintenance_scoped_job

    keys: Set[ProgramTaskKey] = set()
    id_set = set(equipment_ids)
    v2_pm_active: Dict[ProgramTaskKey, bool] = {}

    async for doc in db.maintenance_programs_v2.find(
        scope({"equipment_id": {"$in": equipment_ids}}),
        {"_id": 0, "equipment_id": 1, "tasks": 1},
    ):
        equipment_id = doc.get("equipment_id")
        if not equipment_id:
            continue
        for program_task in doc.get("tasks") or []:
            trace = program_task.get("traceability") or {}
            pm_ref = trace.get("pm_import_task_id")
            if pm_ref:
                v2_pm_active[(equipment_id, str(pm_ref))] = bool(
                    program_task.get("is_active", True)
                )
            if program_task.get("is_active", True):
                continue
            task_id = program_task.get("id")
            if task_id:
                keys.add((equipment_id, str(task_id)))
            if pm_ref:
                keys.add((equipment_id, str(pm_ref)))

    async for session in db.pm_import_sessions.find(
        scope({}),
        {"_id": 0, "session_id": 1, "tasks_extracted": 1},
    ):
        session_id = session.get("session_id")
        if not session_id:
            continue
        for pm_task in session.get("tasks_extracted") or []:
            if not is_pm_import_review_accepted(pm_task):
                continue
            em = pm_task.get("equipment_match") or {}
            equipment_id = em.get("equipment_id")
            task_id = pm_task.get("task_id")
            if not equipment_id or equipment_id not in id_set or not task_id:
                continue
            pm_ref = f"{session_id}:{task_id}"
            v2_state = v2_pm_active.get((equipment_id, pm_ref))
            if v2_state is not None:
                continue
            if pm_task.get("is_active", True):
                continue
            keys.add((equipment_id, pm_ref))

    return keys


async def load_incorporated_pm_import_refs(
    pm_refs: Set[str],
    *,
    user: Optional[dict] = None,
) -> Set[str]:
    """PM import task refs merged or applied into the failure-mode strategy library."""
    from database import db

    if not pm_refs:
        return set()

    incorporated: Set[str] = set()
    scope = (lambda q: maintenance_scoped(user, q)) if user else maintenance_scoped_job
    async for session in db.pm_import_sessions.find(
        scope({}),
        {"_id": 0, "session_id": 1, "tasks_extracted": 1},
    ):
        session_id = session.get("session_id")
        if not session_id:
            continue
        for pm_task in session.get("tasks_extracted") or []:
            if normalize_pm_import_display_status(pm_task) not in INCORPORATED_PM_IMPORT_STATUSES:
                continue
            task_id = pm_task.get("task_id") or pm_task.get("id")
            if not task_id:
                continue
            pm_ref = f"{session_id}:{task_id}"
            if pm_ref in pm_refs:
                incorporated.add(pm_ref)
    return incorporated


def annotate_incorporated_pm_import_tasks(
    tasks: List[Dict[str, Any]],
    incorporated_refs: Set[str],
) -> None:
    """Show merged PM import rows as strategy-backed on the maintenance schedule."""
    if not incorporated_refs:
        return
    for task in tasks:
        pm_ref = task.get("pm_import_task_id")
        if not pm_ref or pm_ref not in incorporated_refs:
            continue
        task["pm_import_incorporated"] = True
        if (task.get("task_source") or "").lower() == "customer_imported":
            task["task_source"] = "strategy_generated"


async def annotate_scheduled_task_sources(
    tasks: List[Dict[str, Any]],
    *,
    user: Optional[dict] = None,
) -> None:
    pm_refs = {str(t["pm_import_task_id"]) for t in tasks if t.get("pm_import_task_id")}
    incorporated = await load_incorporated_pm_import_refs(pm_refs, user=user)
    annotate_incorporated_pm_import_tasks(tasks, incorporated)


def annotate_disabled_in_program(
    tasks: List[Dict[str, Any]],
    inactive_keys: Set[ProgramTaskKey],
) -> None:
    for task in tasks:
        task["disabled_in_program"] = task_disabled_in_program(task, inactive_keys)
