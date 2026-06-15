"""
Equipment Reliability Profile — single composed view for one asset.

Reuses ReliabilityContextService, asset health materializer, graph traversal,
equipment history, and maintenance program data. No duplicate graph logic.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.asset_health_materializer import compute_equipment_snapshot
from services.reliability_context_service import (
    ReliabilityContextService,
    format_context_for_prompt,
)
from services.reliability_graph_query import GraphTraversalService
from services.reliability_snapshot_service import get_snapshot_for_equipment
from services.tenant_schema import merge_tenant_filter
from utils.mongo_regex import exact_case_insensitive

logger = logging.getLogger(__name__)

OPEN_THREAT_STATUSES = ["Open", "open", "In Progress", "in_progress"]
OPEN_ACTION_STATUSES = ["open", "Open", "in_progress", "In Progress", "pending", "Pending"]
CLOSED_ACTION_STATUSES = ["completed", "Completed", "closed", "Closed", "done", "Done"]
OPEN_INVESTIGATION_STATUSES = ["open", "Open", "in_progress", "In Progress", "active", "Active"]


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return None
    return None


def _criticality_label(criticality: Optional[dict]) -> str:
    if not criticality:
        return "Unknown"
    level = criticality.get("level") or criticality.get("label")
    if level:
        return str(level).replace("_", " ").title()
    score = criticality.get("risk_score") or criticality.get("criticality_score")
    if score is not None:
        return f"Score {score}"
    return "Unknown"


def _exposure_rank_score(threat: dict, production_impact: int = 0) -> float:
    risk = float(threat.get("risk_score") or 0)
    rpn = float(threat.get("fmea_rpn") or 0)
    crit_boost = 1.0 + (production_impact / 5.0)
    return round((risk * 0.7 + min(rpn, 1000) * 0.03) * crit_boost, 1)


async def _fetch_open_threats_ranked(
    equipment_id: str,
    equipment_name: str,
    *,
    user: Optional[dict],
    production_impact: int = 0,
    limit: int = 15,
) -> List[dict]:
    query = merge_tenant_filter(
        {
            "status": {"$in": OPEN_THREAT_STATUSES},
            "$or": [
                {"linked_equipment_id": equipment_id},
                {"asset": exact_case_insensitive(equipment_name)} if equipment_name else {"_id": None},
            ],
        },
        user,
    )
    cursor = db.threats.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "failure_mode": 1,
            "risk_score": 1,
            "risk_level": 1,
            "fmea_rpn": 1,
            "status": 1,
            "created_at": 1,
        },
    ).sort("risk_score", -1).limit(limit)
    threats = await cursor.to_list(limit)
    for threat in threats:
        threat["exposure_rank_score"] = _exposure_rank_score(threat, production_impact)
    threats.sort(key=lambda t: t.get("exposure_rank_score", 0), reverse=True)
    return threats


async def _fetch_investigations(
    equipment_id: str,
    equipment_name: str,
    *,
    user: Optional[dict],
    limit: int = 20,
) -> Dict[str, Any]:
    conditions = [{"asset_id": equipment_id}]
    if equipment_name:
        conditions.append({"asset_name": exact_case_insensitive(equipment_name)})
    query = merge_tenant_filter({"$or": conditions}, user)
    cursor = db.investigations.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "status": 1,
            "case_number": 1,
            "created_at": 1,
            "updated_at": 1,
            "threat_id": 1,
        },
    ).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(limit)
    open_items = [
        inv for inv in items if (inv.get("status") or "").lower() in {s.lower() for s in OPEN_INVESTIGATION_STATUSES}
    ]
    return {
        "items": items,
        "open": open_items,
        "open_count": len(open_items),
        "recent_count": len(items),
    }


async def _fetch_actions(
    equipment_id: str,
    equipment_name: str,
    observation_ids: List[str],
    *,
    user: Optional[dict],
    limit: int = 30,
) -> Dict[str, Any]:
    conditions: List[dict] = [
        {"linked_equipment_id": equipment_id},
    ]
    if equipment_name:
        conditions.append({"equipment_name": exact_case_insensitive(equipment_name)})
    if observation_ids:
        conditions.extend([
            {"source_id": {"$in": observation_ids}},
            {"threat_id": {"$in": observation_ids}},
            {"observation_id": {"$in": observation_ids}},
        ])
    query = merge_tenant_filter({"$or": conditions}, user)
    cursor = db.central_actions.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "status": 1,
            "priority": 1,
            "action_type": 1,
            "created_at": 1,
            "completed_at": 1,
            "due_date": 1,
        },
    ).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(limit)
    open_statuses = {s.lower() for s in OPEN_ACTION_STATUSES}
    closed_statuses = {s.lower() for s in CLOSED_ACTION_STATUSES}
    open_items = [a for a in items if (a.get("status") or "").lower() in open_statuses]
    completed_items = [a for a in items if (a.get("status") or "").lower() in closed_statuses]
    return {
        "items": items,
        "open": open_items,
        "completed": completed_items,
        "open_count": len(open_items),
        "completed_count": len(completed_items),
        "effectiveness_note": (
            f"{len(completed_items)} completed action(s) on record"
            if completed_items
            else "No completed actions yet — outcome assessment pending"
        ),
    }


def _failure_mode_stats(threats: List[dict], strategy_modes: List[dict]) -> Dict[str, Any]:
    freq: Dict[str, int] = {}
    severity: Dict[str, float] = {}
    for threat in threats:
        name = (threat.get("failure_mode") or "").strip()
        if not name:
            continue
        freq[name] = freq.get(name, 0) + 1
        score = float(threat.get("risk_score") or 0) + float(threat.get("fmea_rpn") or 0) * 0.1
        severity[name] = max(severity.get(name, 0.0), score)

    strategy_severity = {
        (fm.get("failure_mode_name") or fm.get("name") or ""): float(fm.get("rpn") or fm.get("criticality") or 0)
        for fm in strategy_modes
        if fm.get("failure_mode_name") or fm.get("name")
    }
    for name, rpn in strategy_severity.items():
        if name:
            severity[name] = max(severity.get(name, 0.0), rpn)

    most_frequent = sorted(freq.items(), key=lambda x: (-x[1], x[0]))[:8]
    most_severe = sorted(severity.items(), key=lambda x: (-x[1], x[0]))[:8]
    return {
        "most_frequent": [{"failure_mode": n, "count": c} for n, c in most_frequent],
        "most_severe": [{"failure_mode": n, "severity_score": round(s, 1)} for n, s in most_severe],
    }


def _strategy_coverage(strategy_modes: List[dict], program_tasks: List[dict], graph_edges: List[dict]) -> Dict[str, Any]:
    covered_ids: set[str] = set()
    covered_names: set[str] = set()

    for task in program_tasks or []:
        trace = task.get("traceability") or {}
        fm_id = trace.get("failure_mode_id")
        if fm_id:
            covered_ids.add(str(fm_id))
        fm_name = trace.get("failure_mode_name") or task.get("failure_mode")
        if fm_name:
            covered_names.add(str(fm_name).strip().lower())

    for edge in graph_edges or []:
        if edge.get("relation") != "has_failure_mode":
            continue
        if edge.get("target_type") == "failure_mode" and edge.get("target_id"):
            covered_ids.add(str(edge["target_id"]))
        if edge.get("source_type") == "failure_mode" and edge.get("source_id"):
            covered_ids.add(str(edge["source_id"]))

    covered: List[dict] = []
    not_covered: List[dict] = []
    for fm in strategy_modes or []:
        fm_id = str(fm.get("failure_mode_id") or fm.get("id") or "")
        fm_name = (fm.get("failure_mode_name") or fm.get("name") or "").strip()
        is_covered = (
            (fm_id and fm_id in covered_ids)
            or (fm_name and fm_name.lower() in covered_names)
        )
        entry = {
            "failure_mode_id": fm_id or None,
            "failure_mode_name": fm_name or "Unknown",
            "strategy_type": fm.get("strategy_type"),
        }
        if is_covered:
            covered.append(entry)
        else:
            not_covered.append(entry)

    return {
        "covered": covered,
        "not_covered": not_covered,
        "covered_count": len(covered),
        "not_covered_count": len(not_covered),
        "coverage_pct": round(len(covered) / len(strategy_modes) * 100, 1) if strategy_modes else None,
    }


async def _snapshot_near(
    equipment_id: str,
    target: datetime,
    *,
    user: Optional[dict],
) -> Optional[dict]:
    snap = await get_snapshot_for_equipment(equipment_id, at=target, user=user)
    if snap:
        return snap
    return await db.asset_health_documents.find_one(
        {"equipment_id": equipment_id, "snapshot_date": {"$lte": target.date().isoformat()}},
        {"_id": 0},
        sort=[("snapshot_date", -1)],
    )


async def _build_reliability_trend(
    equipment_id: str,
    *,
    user: Optional[dict],
    twin_snapshot: Optional[dict],
    health_snapshot: Optional[dict],
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    latest_health = None
    if twin_snapshot and twin_snapshot.get("latest"):
        latest = twin_snapshot["latest"]
        latest_health = {
            "health_score": latest.get("health_score"),
            "open_threat_count": latest.get("open_threat_count"),
            "overdue_pm_count": latest.get("overdue_pm_count"),
            "snapshot_at": latest.get("snapshot_at"),
            "source": "reliability_snapshots",
        }
    elif health_snapshot:
        latest_health = {
            "health_score": health_snapshot.get("reliability_score"),
            "open_threat_count": health_snapshot.get("open_threats"),
            "overdue_pm_count": (health_snapshot.get("overdue_pm") or {}).get("total"),
            "snapshot_at": health_snapshot.get("snapshot_date") or health_snapshot.get("generated_at"),
            "source": "asset_health_documents",
        }

    windows: Dict[str, Any] = {}
    for label, days in (("30d", 30), ("90d", 90), ("12mo", 365)):
        prior = await _snapshot_near(equipment_id, now - timedelta(days=days), user=user)
        if not prior:
            windows[label] = {"available": False}
            continue
        prior_score = prior.get("health_score") or prior.get("reliability_score")
        prior_threats = prior.get("open_threat_count") or prior.get("open_threats")
        current_score = (latest_health or {}).get("health_score")
        delta_score = (
            round(float(current_score) - float(prior_score), 1)
            if current_score is not None and prior_score is not None
            else None
        )
        windows[label] = {
            "available": True,
            "health_score": prior_score,
            "open_threat_count": prior_threats,
            "snapshot_at": prior.get("snapshot_at") or prior.get("snapshot_date"),
            "health_score_delta": delta_score,
        }

    series_cursor = db.reliability_snapshots.find(
        {"equipment_id": equipment_id},
        {"_id": 0, "snapshot_at": 1, "health_score": 1, "open_threat_count": 1},
        sort=[("snapshot_at", -1)],
        limit=90,
    )
    series = await series_cursor.to_list(90)
    series.reverse()

    return {
        "current": latest_health,
        "windows": windows,
        "series": series,
    }


async def build_equipment_reliability_profile(
    equipment_id: str,
    user_id: str,
    *,
    user: Optional[dict] = None,
    refresh_context: bool = False,
) -> Dict[str, Any]:
    """Assemble the full reliability profile for one equipment item."""
    ctx = await ReliabilityContextService().get_context(
        equipment_id,
        user_id,
        user=user,
        use_cache=not refresh_context,
    )
    if not ctx.get("found"):
        return {"equipment_id": equipment_id, "found": False}

    equipment = ctx.get("equipment") or {}
    equipment_name = equipment.get("name") or ""
    criticality = equipment.get("criticality") or {}
    production_impact = int(criticality.get("production_impact") or 0)

    risk_explanation = await GraphTraversalService().explain_risk(equipment_id, user=user)

    health_snapshot_task = compute_equipment_snapshot(equipment_id, equipment_doc=equipment)
    program = await db.maintenance_programs_v2.find_one(
        merge_tenant_filter({"equipment_id": equipment_id}, user),
        {"_id": 0, "tasks": 1, "is_active": 1},
    )
    program_tasks = (program or {}).get("tasks") or []

    open_threats_task = _fetch_open_threats_ranked(
        equipment_id,
        equipment_name,
        user=user,
        production_impact=production_impact,
    )
    investigations_task = _fetch_investigations(equipment_id, equipment_name, user=user)
    actions_task = _fetch_actions(
        equipment_id,
        equipment_name,
        [t.get("id") for t in ctx.get("open_threats") or [] if t.get("id")],
        user=user,
    )

    health_snapshot, open_threats, investigations, actions = await asyncio.gather(
        health_snapshot_task,
        open_threats_task,
        investigations_task,
        actions_task,
    )

    twin = ctx.get("twin_snapshot")
    trend = await _build_reliability_trend(
        equipment_id,
        user=user,
        twin_snapshot=twin,
        health_snapshot=health_snapshot,
    )

    graph_edges = (ctx.get("graph") or {}).get("edges") or []
    failure_mode_stats = _failure_mode_stats(open_threats, ctx.get("failure_modes") or [])
    strategy_coverage = _strategy_coverage(ctx.get("failure_modes") or [], program_tasks, graph_edges)

    from services.equipment_reliability_state_service import build_equipment_reliability_state

    reliability_state = await build_equipment_reliability_state(
        equipment_id, user_id, user=user
    )

    health_score = (
        (reliability_state.get("health") or {}).get("score")
        or reliability_state.get("health_score")
    )
    open_observation_count = reliability_state.get("open_observation_count", 0)
    risk_level = reliability_state.get("risk_level") or "Low"
    overdue_pm_count = (
        (reliability_state.get("maintenance") or {}).get("overdue_count")
        or reliability_state.get("overdue_pm_count")
        or 0
    )

    ai_summary = format_context_for_prompt(ctx)

    return {
        "found": True,
        "equipment_id": equipment_id,
        "assembled_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "name": equipment_name or equipment.get("tag") or equipment_id,
            "tag": equipment.get("tag"),
            "level": equipment.get("level"),
            "criticality": _criticality_label(criticality),
            "criticality_detail": criticality,
            "health_score": health_score,
            "risk_level": risk_level,
            "risk_score": open_threats[0].get("risk_score") if open_threats else None,
            "status": "At Risk" if open_observation_count > 0 or (health_score or 100) < 70 else "Stable",
            "open_threat_count": open_observation_count,
            "open_observation_count": open_observation_count,
            "open_investigation_count": investigations.get("open_count", 0),
            "open_action_count": actions.get("open_count", 0),
            "overdue_pm": {"total": overdue_pm_count},
            "program_task_count": reliability_state.get("program_task_count", 0),
            "strategy_version": reliability_state.get("strategy_version"),
            "exposure_score": (reliability_state.get("exposure") or {}).get("score"),
            "canonical_source": reliability_state.get("canonical_source"),
        },
        "trend": trend,
        "open_threats": open_threats,
        "failure_modes": {
            "strategy_modes": ctx.get("failure_modes") or [],
            "stats": failure_mode_stats,
        },
        "investigations": investigations,
        "actions": actions,
        "strategy_coverage": strategy_coverage,
        "risk_explanation": risk_explanation,
        "health_snapshot": health_snapshot,
        "twin_snapshot": twin,
        "ai_reliability_summary": ai_summary,
        "reliability_state": reliability_state,
        "context": ctx,
    }
