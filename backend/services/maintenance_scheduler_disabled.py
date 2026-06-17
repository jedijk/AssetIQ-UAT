"""Helpers for showing program-disabled tasks on the maintenance schedule."""
from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple

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
) -> Set[ProgramTaskKey]:
    """Program tasks currently disabled for the given equipment ids."""
    from database import db

    if not equipment_ids:
        return set()

    keys: Set[ProgramTaskKey] = set()
    id_set = set(equipment_ids)

    async for doc in db.maintenance_programs_v2.find(
        {"equipment_id": {"$in": equipment_ids}},
        {"_id": 0, "equipment_id": 1, "tasks": 1},
    ):
        equipment_id = doc.get("equipment_id")
        if not equipment_id:
            continue
        for program_task in doc.get("tasks") or []:
            if program_task.get("is_active", True):
                continue
            task_id = program_task.get("id")
            if task_id:
                keys.add((equipment_id, str(task_id)))
            trace = program_task.get("traceability") or {}
            pm_ref = trace.get("pm_import_task_id")
            if pm_ref:
                keys.add((equipment_id, str(pm_ref)))

    async for session in db.pm_import_sessions.find(
        {},
        {"_id": 0, "session_id": 1, "tasks_extracted": 1},
    ):
        session_id = session.get("session_id")
        if not session_id:
            continue
        for pm_task in session.get("tasks_extracted") or []:
            if pm_task.get("is_active", True):
                continue
            if not is_pm_import_review_accepted(pm_task):
                continue
            em = pm_task.get("equipment_match") or {}
            equipment_id = em.get("equipment_id")
            task_id = pm_task.get("task_id")
            if not equipment_id or equipment_id not in id_set or not task_id:
                continue
            keys.add((equipment_id, f"{session_id}:{task_id}"))

    return keys


def annotate_disabled_in_program(
    tasks: List[Dict[str, Any]],
    inactive_keys: Set[ProgramTaskKey],
) -> None:
    for task in tasks:
        task["disabled_in_program"] = task_disabled_in_program(task, inactive_keys)
