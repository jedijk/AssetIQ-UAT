"""
Audit helpers for reliability graph edge sync completeness.

Checks that expected edges exist after apply_strategy, PM import, and
scheduled_task completion events.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from database import db

from services.reliability_graph import COLLECTION
from services.program_task_resolution import resolve_program_task_id

logger = logging.getLogger(__name__)


def edge_id(
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
) -> str:
    return f"{source_type}:{source_id}:{relation}:{target_type}:{target_id}"


async def edge_exists(
    *,
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
) -> bool:
    eid = edge_id(source_type, source_id, relation, target_type, target_id)
    doc = await db[COLLECTION].find_one({"id": eid}, {"_id": 1})
    return doc is not None


async def missing_edge(
    *,
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
    context: str = "",
) -> Optional[str]:
    if await edge_exists(
        source_type=source_type,
        source_id=source_id,
        relation=relation,
        target_type=target_type,
        target_id=target_id,
    ):
        return None
    msg = (
        f"missing edge {source_type}:{source_id} -[{relation}]-> "
        f"{target_type}:{target_id}"
    )
    if context:
        msg = f"{context}: {msg}"
    return msg


async def audit_program_task_edges(
    program: dict,
    *,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
) -> List[str]:
    """Verify program_task → failure_mode / template edges for a v2 program."""
    gaps: List[str] = []
    eq_id = equipment_id or program.get("equipment_id")
    et_id = equipment_type_id or program.get("equipment_type_id")

    if eq_id:
        gap = await missing_edge(
            source_type="equipment",
            source_id=eq_id,
            relation="has_program",
            target_type="maintenance_program_v2",
            target_id=program.get("id") or eq_id,
            context="apply_strategy",
        )
        if gap:
            gaps.append(gap)

    for task in program.get("tasks") or []:
        task_id = task.get("id")
        if not task_id:
            continue
        trace = task.get("traceability") or {}
        fm_id = trace.get("failure_mode_id")
        if fm_id:
            gap = await missing_edge(
                source_type="program_task",
                source_id=task_id,
                relation="mitigates_failure_mode",
                target_type="failure_mode",
                target_id=fm_id,
                context="apply_strategy",
            )
            if gap:
                gaps.append(gap)
        template_id = trace.get("task_template_id")
        if template_id:
            gap = await missing_edge(
                source_type="program_task",
                source_id=task_id,
                relation="derived_from_template",
                target_type="strategy_task_template",
                target_id=template_id,
                context="apply_strategy",
            )
            if gap:
                gaps.append(gap)

    if et_id and eq_id:
        gap = await missing_edge(
            source_type="equipment",
            source_id=eq_id,
            relation="has_strategy_type",
            target_type="equipment_type_strategy",
            target_id=et_id,
            context="apply_strategy",
        )
        if gap:
            gaps.append(gap)

    return gaps


async def audit_pm_import_task(
    task_id: str,
    failure_mode_id: str,
) -> Optional[str]:
    return await missing_edge(
        source_type="pm_import_task",
        source_id=task_id,
        relation="applied_to",
        target_type="failure_mode",
        target_id=failure_mode_id,
        context="pm_import",
    )


async def audit_scheduled_task_completed(scheduled_task: dict) -> List[str]:
    """Verify lifecycle edges for a completed scheduled_task."""
    gaps: List[str] = []
    task_id = scheduled_task.get("id")
    if not task_id:
        return ["scheduled_task missing id"]

    equipment_id = scheduled_task.get("equipment_id")
    program_task_id = await resolve_program_task_id(scheduled_task)
    failure_mode_id = scheduled_task.get("failure_mode_id")

    base_checks = [
        ("derived_from", "program_task", program_task_id),
        ("scheduled_for", "equipment", equipment_id),
        ("mitigates_failure_mode", "failure_mode", failure_mode_id),
        ("completed_on", "equipment", equipment_id),
    ]
    for relation, target_type, target_id in base_checks:
        if not target_id:
            if relation == "completed_on" and not equipment_id:
                gaps.append(f"task_complete: scheduled_task {task_id} missing completed_on (no equipment_id)")
            continue
        gap = await missing_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation=relation,
            target_type=target_type,
            target_id=target_id,
            context="task_complete",
        )
        if gap:
            gaps.append(gap)

    return gaps


async def sample_db_audit(*, limit: int = 50) -> Dict[str, Any]:
    """
    Sample recent entities and report edge sync coverage.

    Returns counts and gap samples for UAT gate reporting.
    """
    result: Dict[str, Any] = {
        "sample_limit": limit,
        "apply_strategy": {"checked": 0, "gaps": []},
        "pm_import": {"checked": 0, "gaps": []},
        "task_complete": {"checked": 0, "gaps": []},
    }

    programs = await db.maintenance_programs_v2.find({}, {"_id": 0}).limit(limit).to_list(limit)
    for program in programs:
        result["apply_strategy"]["checked"] += 1
        gaps = await audit_program_task_edges(program)
        if gaps:
            result["apply_strategy"]["gaps"].extend(gaps[:3])

    pm_cursor = db.reliability_edges.find(
        {"source_type": "pm_import_task", "relation": "applied_to"},
        {"_id": 0, "source_id": 1, "target_id": 1},
    ).limit(limit)
    async for edge in pm_cursor:
        result["pm_import"]["checked"] += 1
        gap = await audit_pm_import_task(edge["source_id"], edge["target_id"])
        if gap:
            result["pm_import"]["gaps"].append(gap)

    completed = await db.scheduled_tasks.find(
        {"status": "completed"},
        {"_id": 0},
    ).sort("completed_at", -1).limit(limit).to_list(limit)

    for task in completed:
        result["task_complete"]["checked"] += 1
        gaps = await audit_scheduled_task_completed(task)
        if gaps:
            result["task_complete"]["gaps"].extend(gaps[:2])

    total_gaps = (
        len(result["apply_strategy"]["gaps"])
        + len(result["pm_import"]["gaps"])
        + len(result["task_complete"]["gaps"])
    )
    result["total_gaps"] = total_gaps
    result["passed"] = total_gaps == 0
    return result
