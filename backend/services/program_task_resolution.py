"""
Resolve scheduler ``maintenance_program_id`` values from v2 nested tasks
and optional legacy flat programs.
"""
from typing import Any, Dict, List, Optional, Set

from database import db


async def v2_task_ids_for_template(
    equipment_type_id: str,
    task_template_id: str,
) -> List[str]:
    """V2 task ids whose traceability links to a strategy task template."""
    ids: List[str] = []
    async for prog in db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"tasks": 1, "_id": 0},
    ):
        for task in prog.get("tasks") or []:
            trace = task.get("traceability") or {}
            if trace.get("task_template_id") != task_template_id:
                continue
            task_id = task.get("id")
            if task_id:
                ids.append(task_id)
    return ids


async def v2_task_ids_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
) -> List[str]:
    ids: List[str] = []
    async for prog in db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"tasks": 1, "_id": 0},
    ):
        for task in prog.get("tasks") or []:
            trace = task.get("traceability") or {}
            if trace.get("failure_mode_id") != failure_mode_id:
                continue
            task_id = task.get("id")
            if task_id:
                ids.append(task_id)
    return ids


async def legacy_program_ids_for_template(
    equipment_type_id: str,
    task_template_id: str,
) -> List[str]:
    return [
        p["id"]
        async for p in db.maintenance_programs.find(
            {
                "equipment_type_id": equipment_type_id,
                "task_template_id": task_template_id,
            },
            {"id": 1, "_id": 0},
        )
        if p.get("id")
    ]


async def legacy_program_ids_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
) -> List[str]:
    return [
        p["id"]
        async for p in db.maintenance_programs.find(
            {
                "equipment_type_id": equipment_type_id,
                "failure_mode_id": failure_mode_id,
            },
            {"id": 1, "_id": 0},
        )
        if p.get("id")
    ]


async def legacy_program_ids_for_equipment_type(equipment_type_id: str) -> List[str]:
    return [
        p["id"]
        async for p in db.maintenance_programs.find(
            {"equipment_type_id": equipment_type_id},
            {"id": 1, "_id": 0},
        )
        if p.get("id")
    ]


def _dedupe(ids: List[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for item in ids:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


async def scheduler_program_ids_for_task_template(
    equipment_type_id: str,
    task_template_id: str,
    *,
    include_legacy: bool = True,
) -> List[str]:
    """IDs referenced by ``scheduled_tasks.maintenance_program_id`` for a template."""
    ids = await v2_task_ids_for_template(equipment_type_id, task_template_id)
    if include_legacy:
        ids.extend(
            await legacy_program_ids_for_template(equipment_type_id, task_template_id)
        )
    return _dedupe(ids)


async def scheduler_program_ids_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
    *,
    include_legacy: bool = True,
) -> List[str]:
    ids = await v2_task_ids_for_failure_mode(equipment_type_id, failure_mode_id)
    if include_legacy:
        ids.extend(
            await legacy_program_ids_for_failure_mode(equipment_type_id, failure_mode_id)
        )
    return _dedupe(ids)


async def scheduler_program_ids_for_equipment_type(
    equipment_type_id: str,
    *,
    include_legacy: bool = True,
) -> List[str]:
    ids: List[str] = []
    async for prog in db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"tasks.id": 1, "_id": 0},
    ):
        for task in prog.get("tasks") or []:
            task_id = task.get("id")
            if task_id:
                ids.append(task_id)
    if include_legacy:
        ids.extend(await legacy_program_ids_for_equipment_type(equipment_type_id))
    return _dedupe(ids)
