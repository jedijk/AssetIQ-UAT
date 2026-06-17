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


async def resolve_program_task_id(scheduled_task: Dict[str, Any]) -> Optional[str]:
    """
    Resolve the v2 nested program task id for graph edges from a scheduled_task.

    Legacy rows store maintenance_programs.id in maintenance_program_id; v2 rows
    store the nested tasks[].id (same field name, different semantics).
    """
    if not scheduled_task:
        return None

    explicit = scheduled_task.get("v2_task_id") or scheduled_task.get("program_task_id")
    if explicit:
        return str(explicit)

    mp_id = scheduled_task.get("maintenance_program_id")
    if not mp_id:
        return None

    if scheduled_task.get("program_source") == "v2":
        return str(mp_id)

    v2_hit = await db.maintenance_programs_v2.find_one(
        {"tasks.id": mp_id},
        {"_id": 0, "tasks.id": 1},
    )
    if v2_hit:
        return str(mp_id)

    legacy = await db.maintenance_programs.find_one(
        {"id": mp_id},
        {"_id": 0, "v2_task_id": 1},
    )
    if legacy and legacy.get("v2_task_id"):
        return str(legacy["v2_task_id"])

    equipment_id = scheduled_task.get("equipment_id")
    task_name = (scheduled_task.get("task_name") or "").strip()
    if equipment_id and task_name:
        prog = await db.maintenance_programs_v2.find_one(
            {"equipment_id": equipment_id},
            {"_id": 0, "tasks": 1},
        )
        if prog:
            name_lo = task_name.lower()
            for task in prog.get("tasks") or []:
                title = (task.get("task_title") or task.get("name") or "").strip().lower()
                if title == name_lo and task.get("id"):
                    return str(task["id"])

    return None


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


async def count_active_maintenance_programs_for_task_template(
    equipment_type_id: str,
    task_template_id: str,
) -> int:
    """Count equipment maintenance programs with an active linked strategy task."""
    equipment_ids: Set[str] = set()
    async for prog in db.maintenance_programs_v2.find(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0, "equipment_id": 1, "status": 1, "tasks": 1},
    ):
        status = (prog.get("status") or "active").lower()
        if status not in ("active", "draft"):
            continue
        equipment_id = prog.get("equipment_id")
        if not equipment_id:
            continue
        for task in prog.get("tasks") or []:
            trace = task.get("traceability") or {}
            if trace.get("task_template_id") != task_template_id:
                continue
            if not task.get("is_active", True):
                continue
            equipment_ids.add(equipment_id)
            break

    from services.scheduler_config import should_read_legacy_maintenance_programs

    if should_read_legacy_maintenance_programs():
        async for prog in db.maintenance_programs.find(
            {
                "equipment_type_id": equipment_type_id,
                "task_template_id": task_template_id,
                "is_active": True,
            },
            {"equipment_id": 1, "_id": 0},
        ):
            if prog.get("equipment_id"):
                equipment_ids.add(prog["equipment_id"])

    return len(equipment_ids)


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
