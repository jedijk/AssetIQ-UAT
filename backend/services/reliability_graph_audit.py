"""
Audit helpers for reliability graph edge sync completeness.

Checks that expected edges exist after apply_strategy, PM import,
scheduled_task lifecycle, observation/threat, and investigation events.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from database import db

from services.reliability_graph import COLLECTION, EDGE_STATUS_ACTIVE
from services.program_task_resolution import resolve_program_task_id
from services.tenant_schema import tenant_read_filter
from services.tenant_scope import scoped_job

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
    tenant_id: Optional[str] = None,
) -> bool:
    eid = edge_id(source_type, source_id, relation, target_type, target_id)
    query: Dict[str, Any] = {"id": eid, "status": EDGE_STATUS_ACTIVE}
    if tenant_id:
        query["$or"] = [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]
    doc = await db[COLLECTION].find_one(query, {"_id": 1})
    return doc is not None


async def missing_edge(
    *,
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
    context: str = "",
    tenant_id: Optional[str] = None,
) -> Optional[str]:
    if await edge_exists(
        source_type=source_type,
        source_id=source_id,
        relation=relation,
        target_type=target_type,
        target_id=target_id,
        tenant_id=tenant_id,
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
    tenant_id: Optional[str] = None,
) -> List[str]:
    """Verify program_task → failure_mode / template edges for a v2 program."""
    gaps: List[str] = []
    eq_id = equipment_id or program.get("equipment_id")
    et_id = equipment_type_id or program.get("equipment_type_id")
    program_id = program.get("id") or eq_id

    if eq_id:
        for rel, ttype, tid in (
            ("has_program", "maintenance_program_v2", program_id),
            ("has_strategy_type", "equipment_type_strategy", et_id),
        ):
            if not tid:
                continue
            gap = await missing_edge(
                source_type="equipment",
                source_id=eq_id,
                relation=rel,
                target_type=ttype,
                target_id=tid,
                context="apply_strategy",
                tenant_id=tenant_id,
            )
            if gap:
                gaps.append(gap)

    if program_id and et_id:
        gap = await missing_edge(
            source_type="maintenance_program_v2",
            source_id=program_id,
            relation="governed_by",
            target_type="equipment_type_strategy",
            target_id=et_id,
            context="apply_strategy",
            tenant_id=tenant_id,
        )
        if gap:
            gaps.append(gap)

    for task in program.get("tasks") or []:
        task_id = task.get("id")
        if not task_id:
            continue
        if program_id:
            gap = await missing_edge(
                source_type="maintenance_program_v2",
                source_id=program_id,
                relation="contains_task",
                target_type="program_task",
                target_id=task_id,
                context="apply_strategy",
                tenant_id=tenant_id,
            )
            if gap:
                gaps.append(gap)
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
                tenant_id=tenant_id,
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
                tenant_id=tenant_id,
            )
            if gap:
                gaps.append(gap)

    return gaps


async def audit_pm_import_task(
    task_id: str,
    failure_mode_id: str,
    *,
    tenant_id: Optional[str] = None,
) -> Optional[str]:
    return await missing_edge(
        source_type="pm_import_task",
        source_id=task_id,
        relation="applied_to",
        target_type="failure_mode",
        target_id=failure_mode_id,
        context="pm_import",
        tenant_id=tenant_id,
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


async def audit_scheduled_task_created(scheduled_task: dict) -> List[str]:
    """Verify base edges exist at schedule time."""
    gaps: List[str] = []
    task_id = scheduled_task.get("id")
    if not task_id:
        return ["scheduled_task missing id"]

    equipment_id = scheduled_task.get("equipment_id")
    program_task_id = await resolve_program_task_id(scheduled_task)

    for relation, target_type, target_id in (
        ("derived_from", "program_task", program_task_id),
        ("scheduled_for", "equipment", equipment_id),
    ):
        if not target_id:
            continue
        gap = await missing_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation=relation,
            target_type=target_type,
            target_id=target_id,
            context="scheduled_created",
        )
        if gap:
            gaps.append(gap)
    return gaps


async def audit_observation_edges(
    observation_id: str,
    *,
    equipment_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    threat_id: Optional[str] = None,
) -> List[str]:
    gaps: List[str] = []
    if equipment_id:
        gap = await missing_edge(
            source_type="observation",
            source_id=observation_id,
            relation="observed_on",
            target_type="equipment",
            target_id=equipment_id,
            context="observation",
        )
        if gap:
            gaps.append(gap)
    if failure_mode_id:
        gap = await missing_edge(
            source_type="observation",
            source_id=observation_id,
            relation="indicates_failure_mode",
            target_type="failure_mode",
            target_id=str(failure_mode_id),
            context="observation",
        )
        if gap:
            gaps.append(gap)
    if threat_id:
        for rel in ("linked_to_threat", "escalated_to"):
            gap = await missing_edge(
                source_type="observation",
                source_id=observation_id,
                relation=rel,
                target_type="threat",
                target_id=threat_id,
                context="observation",
            )
            if gap:
                gaps.append(gap)
    return gaps


async def audit_investigation_chain(
    investigation: dict,
    *,
    threat_id: Optional[str] = None,
) -> List[str]:
    gaps: List[str] = []
    inv_id = investigation.get("id")
    tid = threat_id or investigation.get("threat_id")
    if inv_id and tid:
        gap = await missing_edge(
            source_type="threat",
            source_id=tid,
            relation="triggered_investigation",
            target_type="investigation",
            target_id=inv_id,
            context="investigation",
        )
        if gap:
            gaps.append(gap)
    return gaps


async def sample_db_audit(
    *,
    limit: int = 50,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sample recent entities and report edge sync coverage.

    Returns counts and gap samples for UAT gate reporting.
    """
    result: Dict[str, Any] = {
        "sample_limit": limit,
        "tenant_id": tenant_id,
        "apply_strategy": {"checked": 0, "gaps": []},
        "pm_import": {"checked": 0, "gaps": []},
        "task_complete": {"checked": 0, "gaps": []},
        "scheduled_created": {"checked": 0, "gaps": []},
        "observation": {"checked": 0, "gaps": []},
        "investigation": {"checked": 0, "gaps": []},
        "tenant_edges_missing_id": 0,
    }

    program_query: Dict[str, Any] = scoped_job({}, tenant_id=tenant_id) if tenant_id else {}

    programs = await db.maintenance_programs_v2.find(
        program_query, {"_id": 0}
    ).limit(limit).to_list(limit)
    for program in programs:
        result["apply_strategy"]["checked"] += 1
        gaps = await audit_program_task_edges(program, tenant_id=tenant_id)
        if gaps:
            result["apply_strategy"]["gaps"].extend(gaps[:3])

    edge_query: Dict[str, Any] = scoped_job({
        "source_type": "pm_import_task",
        "relation": "applied_to",
        "status": EDGE_STATUS_ACTIVE,
    }, tenant_id=tenant_id) if tenant_id else {
        "source_type": "pm_import_task",
        "relation": "applied_to",
        "status": EDGE_STATUS_ACTIVE,
    }
    pm_cursor = db[COLLECTION].find(
        edge_query,
        {"_id": 0, "source_id": 1, "target_id": 1},
    ).limit(limit)
    async for edge in pm_cursor:
        result["pm_import"]["checked"] += 1
        gap = await audit_pm_import_task(edge["source_id"], edge["target_id"], tenant_id=tenant_id)
        if gap:
            result["pm_import"]["gaps"].append(gap)

    completed = await db.scheduled_tasks.find(
        scoped_job({"status": "completed"}, tenant_id=tenant_id) if tenant_id else {"status": "completed"},
        {"_id": 0},
    ).sort("completed_at", -1).limit(limit).to_list(limit)

    for task in completed:
        result["task_complete"]["checked"] += 1
        gaps = await audit_scheduled_task_completed(task)
        if gaps:
            result["task_complete"]["gaps"].extend(gaps[:2])

    scheduled_open = await db.scheduled_tasks.find(
        scoped_job({"status": {"$nin": ["completed", "cancelled"]}}, tenant_id=tenant_id)
        if tenant_id
        else {"status": {"$nin": ["completed", "cancelled"]}},
        {"_id": 0},
    ).sort("due_date", -1).limit(limit).to_list(limit)
    for task in scheduled_open:
        result["scheduled_created"]["checked"] += 1
        gaps = await audit_scheduled_task_created(task)
        if gaps:
            result["scheduled_created"]["gaps"].extend(gaps[:2])

    obs_query = scoped_job({}, tenant_id=tenant_id) if tenant_id else {}
    obs_cursor = db.observations.find(obs_query, {"_id": 0}).sort("created_at", -1).limit(limit)
    async for obs in obs_cursor:
        obs_id = obs.get("id") or str(obs.get("_id", ""))
        if not obs_id:
            continue
        result["observation"]["checked"] += 1
        gaps = await audit_observation_edges(
            obs_id,
            equipment_id=obs.get("equipment_id"),
            failure_mode_id=obs.get("failure_mode_id"),
            threat_id=obs.get("threat_id"),
        )
        if gaps:
            result["observation"]["gaps"].extend(gaps[:2])

    inv_cursor = db.investigations.find(
        scoped_job(
            {"threat_id": {"$exists": True, "$ne": None}},
            tenant_id=tenant_id,
        )
        if tenant_id
        else {"threat_id": {"$exists": True, "$ne": None}},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    async for inv in inv_cursor:
        result["investigation"]["checked"] += 1
        gaps = await audit_investigation_chain(inv)
        if gaps:
            result["investigation"]["gaps"].extend(gaps[:2])

    tenant_gap_query: Dict[str, Any] = {"tenant_id": {"$exists": False}}
    result["tenant_edges_missing_id"] = await db[COLLECTION].count_documents(tenant_gap_query)

    total_gaps = sum(
        len(result[section]["gaps"])
        for section in (
            "apply_strategy",
            "pm_import",
            "task_complete",
            "scheduled_created",
            "observation",
            "investigation",
        )
    )
    result["total_gaps"] = total_gaps
    result["passed"] = total_gaps == 0
    return result
