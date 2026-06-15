"""
Supervisor Command Center — composes existing services into one operational queue.

Reuses executive_reliability_kpis, maintenance scheduler KPIs, threat services,
investigation reads, and graph KPIs. No duplicate dashboard logic.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.criticality_score import resolve_equipment_criticality_score
from services.tenant_schema import merge_tenant_filter

PRIORITY_WEIGHTS = {
    "exposure": 0.25,
    "criticality": 0.25,
    "threat_score": 0.30,
    "graph_risk": 0.20,
}

BLOCKED_INVESTIGATION_DAYS = 7
SECTION_LIMIT = 15
QUEUE_LIMIT = 25

_OPEN_THREAT_STATUSES = ["Open", "open", "In Progress", "in_progress"]
_OPEN_ACTION_STATUSES = ["open", "in_progress", "planned", "Open", "In Progress"]
_STALE_INVESTIGATION_STATUSES = ["draft", "in_progress"]


def compute_queue_priority(
    *,
    exposure: float = 0,
    criticality: float = 0,
    threat_score: float = 0,
    graph_risk: float = 0,
    overdue_boost: float = 0,
) -> float:
    base = (
        exposure * PRIORITY_WEIGHTS["exposure"]
        + criticality * PRIORITY_WEIGHTS["criticality"]
        + threat_score * PRIORITY_WEIGHTS["threat_score"]
        + graph_risk * PRIORITY_WEIGHTS["graph_risk"]
    )
    return round(min(100, base + overdue_boost), 1)


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _is_open_threat(threat: dict) -> bool:
    status = (threat.get("status") or "").lower()
    return status not in ("closed", "resolved")


def _is_escalating_threat(threat: dict) -> bool:
    if not _is_open_threat(threat):
        return False
    level = (threat.get("risk_level") or "").lower()
    score = float(threat.get("risk_score") or 0)
    return level in ("high", "critical") or score >= 60


def _threat_exposure(threat: dict) -> float:
    score = threat.get("risk_score")
    if score is not None:
        try:
            return min(100, float(score))
        except (TypeError, ValueError):
            pass
    level = (threat.get("risk_level") or "").lower()
    return {"critical": 90, "high": 70, "medium": 45, "low": 20}.get(level, 30)


def _priority_from_level(priority: Optional[str]) -> float:
    return {"critical": 80, "high": 60, "medium": 40, "low": 20}.get(
        (priority or "medium").lower(), 40
    )


async def _equipment_criticality_map(
    equipment_ids: List[str],
    user: dict,
) -> Dict[str, float]:
    if not equipment_ids:
        return {}
    unique = list({eid for eid in equipment_ids if eid})
    rows = await db.equipment_nodes.find(
        merge_tenant_filter({"id": {"$in": unique}}, user),
        {"_id": 0, "id": 1, "criticality": 1},
    ).to_list(len(unique))
    result: Dict[str, float] = {}
    for row in rows:
        score = resolve_equipment_criticality_score(row.get("criticality"))
        if score is not None:
            result[row["id"]] = float(score)
    return result


def _serialize_threat_item(threat: dict, *, criticality: float = 0) -> dict:
    exposure = _threat_exposure(threat)
    threat_score = float(threat.get("risk_score") or exposure)
    graph_risk = 70 if _is_escalating_threat(threat) else 35
    priority = compute_queue_priority(
        exposure=exposure,
        criticality=criticality,
        threat_score=threat_score,
        graph_risk=graph_risk,
    )
    tid = threat.get("id")
    return {
        "id": tid,
        "type": "threat",
        "title": threat.get("title") or threat.get("description") or "Observation",
        "subtitle": threat.get("asset") or threat.get("equipment_name"),
        "equipment_id": threat.get("linked_equipment_id"),
        "risk_level": threat.get("risk_level"),
        "risk_score": threat_score,
        "priority_score": priority,
        "drill_down": f"/threats/{tid}/workspace" if tid else "/threats",
    }


def _serialize_pm_item(task: dict, *, criticality: float = 0) -> dict:
    priority = compute_queue_priority(
        criticality=criticality,
        overdue_boost=15,
    )
    return {
        "id": task.get("id"),
        "type": "overdue_pm",
        "title": task.get("task_name") or "PM Task",
        "subtitle": task.get("equipment_name"),
        "equipment_id": task.get("equipment_id"),
        "due_date": task.get("due_date"),
        "priority": task.get("priority"),
        "assigned_to": task.get("assigned_technician_name"),
        "priority_score": priority,
        "drill_down": "/tasks",
    }


def _serialize_action_item(action: dict, *, criticality: float = 0) -> dict:
    exposure = float(action.get("risk_score") or _priority_from_level(action.get("priority")))
    priority = compute_queue_priority(
        exposure=exposure,
        criticality=criticality,
        threat_score=exposure * 0.5,
    )
    aid = action.get("id")
    return {
        "id": aid,
        "type": "action",
        "title": action.get("title") or action.get("description") or "Action",
        "subtitle": action.get("equipment_name") or action.get("asset"),
        "equipment_id": action.get("equipment_id"),
        "due_date": action.get("due_date"),
        "status": action.get("status"),
        "priority_score": priority,
        "drill_down": f"/actions/{aid}" if aid else "/actions",
    }


def _serialize_investigation_item(inv: dict) -> dict:
    priority = compute_queue_priority(exposure=55, graph_risk=40)
    iid = inv.get("id")
    return {
        "id": iid,
        "type": "investigation",
        "title": inv.get("title") or "Investigation",
        "subtitle": inv.get("asset_name"),
        "status": inv.get("status"),
        "threat_id": inv.get("threat_id"),
        "priority_score": priority,
        "drill_down": f"/causal-engine?id={iid}" if iid else "/causal-engine",
    }


async def _fetch_crew_workload(user: dict) -> List[dict]:
    from services.maintenance_scheduler_scope import scheduler_scoped

    today = datetime.now(timezone.utc).date().isoformat()
    match = scheduler_scoped(user, {
        "status": {"$nin": ["completed", "cancelled"]},
        "assigned_technician_id": {"$exists": True, "$ne": None},
    })
    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": "$assigned_technician_id",
                "name": {"$first": "$assigned_technician_name"},
                "open_tasks": {"$sum": 1},
                "overdue_tasks": {
                    "$sum": {
                        "$cond": [
                            {"$lt": ["$due_date", today]},
                            1,
                            0,
                        ]
                    }
                },
            }
        },
        {"$sort": {"open_tasks": -1}},
        {"$limit": SECTION_LIMIT},
    ]
    rows = await db.scheduled_tasks.aggregate(pipeline).to_list(SECTION_LIMIT)

    tech_capacity = {
        t.get("id"): t
        for t in await db.technician_capacity.find(
            scheduler_scoped(user, {"is_active": True}),
            {"_id": 0, "id": 1, "name": 1, "daily_hours": 1, "weekly_hours": 1},
        ).to_list(100)
    }

    crew: List[dict] = []
    for row in rows:
        tech_id = row.get("_id")
        cap = tech_capacity.get(tech_id) or {}
        open_tasks = int(row.get("open_tasks") or 0)
        daily_hours = float(cap.get("daily_hours") or 8)
        crew.append({
            "technician_id": tech_id,
            "name": row.get("name") or cap.get("name") or "Technician",
            "open_tasks": open_tasks,
            "overdue_tasks": int(row.get("overdue_tasks") or 0),
            "daily_hours": daily_hours,
            "utilization_pct": round(min(100, open_tasks / max(daily_hours, 1) * 12.5), 1),
            "drill_down": "/tasks",
        })
    return crew


async def get_supervisor_dashboard(user: dict) -> Dict[str, Any]:
    """Aggregate supervisor sections from existing platform services."""
    now = datetime.now(timezone.utc)
    blocked_cutoff = now - timedelta(days=BLOCKED_INVESTIGATION_DAYS)

    from services.executive_reliability_kpis import compute_executive_reliability_kpis
    from services.equipment_reliability_state_service import (
        batch_equipment_reliability_states,
        compute_fleet_reliability_summary,
    )
    from services.maintenance_scheduler_service import get_daily_planner, get_dashboard_kpis
    from services.threat_service import list_threats

    fleet_summary = await compute_fleet_reliability_summary(user=user)
    reliability_kpis = await compute_executive_reliability_kpis(user=user)
    scheduler_kpis = await get_dashboard_kpis(user)
    daily_planner = await get_daily_planner(user)

    threats_raw = await list_threats(user, limit=SECTION_LIMIT * 3)
    open_threats_raw = [t for t in threats_raw if _is_open_threat(t)]
    escalating_raw = [t for t in open_threats_raw if _is_escalating_threat(t)]
    escalating_raw.sort(key=lambda t: float(t.get("risk_score") or 0), reverse=True)

    overdue_tasks = (daily_planner.get("overdue") or {}).get("tasks") or []

    inv_rows = await db.investigations.find(
        merge_tenant_filter({"status": {"$in": _STALE_INVESTIGATION_STATUSES}}, user),
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "status": 1,
            "asset_name": 1,
            "threat_id": 1,
            "updated_at": 1,
            "created_at": 1,
        },
    ).sort("updated_at", 1).limit(100).to_list(100)

    blocked_investigations = []
    for inv in inv_rows:
        stamp = _parse_dt(inv.get("updated_at")) or _parse_dt(inv.get("created_at"))
        if stamp and stamp < blocked_cutoff:
            blocked_investigations.append(inv)
        if len(blocked_investigations) >= SECTION_LIMIT:
            break

    open_actions_raw = await db.central_actions.find(
        merge_tenant_filter({"status": {"$in": _OPEN_ACTION_STATUSES}}, user),
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "description": 1,
            "status": 1,
            "priority": 1,
            "due_date": 1,
            "equipment_id": 1,
            "equipment_name": 1,
            "asset": 1,
            "assigned_to": 1,
            "risk_score": 1,
        },
    ).sort([("due_date", 1)]).limit(SECTION_LIMIT).to_list(SECTION_LIMIT)

    crew_workload = await _fetch_crew_workload(user)

    equipment_ids = list({
        eid
        for eid in (
            [t.get("equipment_id") for t in overdue_tasks]
            + [t.get("linked_equipment_id") for t in open_threats_raw]
            + [a.get("equipment_id") for a in open_actions_raw]
        )
        if eid
    })
    crit_map = await _equipment_criticality_map(equipment_ids, user)
    state_by_equipment = await batch_equipment_reliability_states(
        equipment_ids,
        user.get("id"),
        user=user,
    )

    overdue_pm = [
        _serialize_pm_item(t, criticality=crit_map.get(t.get("equipment_id") or "", 0))
        for t in overdue_tasks[:SECTION_LIMIT]
    ]
    open_threats = [
        _serialize_threat_item(t, criticality=crit_map.get(t.get("linked_equipment_id") or "", 0))
        for t in open_threats_raw[:SECTION_LIMIT]
    ]
    escalating_risks = [
        _serialize_threat_item(t, criticality=crit_map.get(t.get("linked_equipment_id") or "", 0))
        for t in escalating_raw[:SECTION_LIMIT]
    ]
    blocked_inv_items = [_serialize_investigation_item(inv) for inv in blocked_investigations]
    open_actions = [
        _serialize_action_item(a, criticality=crit_map.get(a.get("equipment_id") or "", 0))
        for a in open_actions_raw
    ]

    queue_candidates = overdue_pm + open_threats + blocked_inv_items + open_actions
    graph_high_risk = int((reliability_kpis.get("graph_kpis") or {}).get("high_risk_threats") or 0)
    for item in queue_candidates:
        if item["type"] == "threat" and graph_high_risk:
            item["priority_score"] = min(
                100,
                item["priority_score"] + min(10, graph_high_risk),
            )

    prioritized_queue = sorted(
        queue_candidates,
        key=lambda item: item.get("priority_score") or 0,
        reverse=True,
    )[:QUEUE_LIMIT]

    for item in prioritized_queue:
        eid = item.get("equipment_id") or item.get("linked_equipment_id")
        if eid and eid in state_by_equipment:
            item["reliability_state"] = state_by_equipment[eid]

    return {
        "generated_at": now.isoformat(),
        "summary": {
            "overdue_pm_count": fleet_summary.get("overdue_pm", {}).get("total")
            or len(overdue_pm),
            "open_threats_count": fleet_summary.get("open_observation_count")
            or len(open_threats),
            "unified_open_signals_count": fleet_summary.get("unified_open_signals"),
            "escalating_risks_count": len(escalating_risks),
            "blocked_investigations_count": len(blocked_inv_items),
            "open_actions_count": len(open_actions),
            "crew_members": len(crew_workload),
            "scheduler_overdue": (scheduler_kpis.get("backlog") or {}).get("overdue_tasks"),
            "canonical_source": fleet_summary.get("canonical_source"),
        },
        "overdue_pm": {"count": len(overdue_pm), "items": overdue_pm},
        "open_threats": {"count": len(open_threats), "items": open_threats},
        "escalating_risks": {"count": len(escalating_risks), "items": escalating_risks},
        "blocked_investigations": {
            "count": len(blocked_inv_items),
            "items": blocked_inv_items,
        },
        "open_actions": {"count": len(open_actions), "items": open_actions},
        "crew_workload": {"count": len(crew_workload), "items": crew_workload},
        "prioritized_queue": {"count": len(prioritized_queue), "items": prioritized_queue},
        "reliability_kpis": {
            **fleet_summary,
            "graph_kpis": reliability_kpis.get("graph_kpis"),
            "mtbf_proxy": reliability_kpis.get("mtbf_proxy"),
        },
    }
