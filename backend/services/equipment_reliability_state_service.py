"""
Equipment reliability state — authoritative per-asset reliability projection.

Convergence 1/2: all reliability KPIs for dashboards, profile, copilot, and trace
should read from ``build_equipment_reliability_state`` or ``compute_fleet_reliability_summary``.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.asset_health_materializer import compute_equipment_snapshot
from services.reliability_context_service import ReliabilityContextService
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)

OPEN_THREAT_STATUSES = ["Open", "open", "In Progress", "in_progress"]
CANONICAL_SOURCE = "equipment_reliability_state"


def _graph_fingerprint(edges: list) -> str:
    """Stable hash of active graph edge ids for change detection."""
    ids = sorted(
        str(e.get("id") or e.get("edge_id") or "")
        for e in (edges or [])
        if e.get("status", "active") != "retired"
    )
    payload = json.dumps(ids, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _compute_exposure_score(
    *,
    open_count: int,
    health_score: Optional[float],
    overdue_pm: int,
    max_threat_risk: float = 0,
) -> float:
    """Operational exposure score 0–100 (queue priority input)."""
    base = max(float(max_threat_risk or 0), open_count * 12.0)
    if health_score is not None:
        if health_score < 50:
            base = max(base, 85.0)
        elif health_score < 70:
            base = max(base, 55.0)
    if overdue_pm > 0:
        base += 8.0
    return round(min(100.0, base), 1)


def _strategy_coverage_pct(failure_modes: list, program_task_count: int, graph_edges: list) -> Optional[float]:
    if not failure_modes:
        return None
    mitigated = sum(
        1
        for fm in failure_modes
        if fm.get("mitigated") or fm.get("has_program_task")
    )
    if program_task_count and failure_modes:
        return round(min(100.0, (program_task_count / max(len(failure_modes), 1)) * 100), 1)
    if failure_modes:
        return round(mitigated / len(failure_modes) * 100, 1)
    return None


async def build_equipment_reliability_state(
    equipment_id: str,
    user_id: str,
    *,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Return the authoritative reliability state snapshot for one asset."""
    ctx = await ReliabilityContextService().get_context(
        equipment_id,
        user_id,
        user=user,
        use_cache=True,
    )
    if not ctx.get("found"):
        return {"equipment_id": equipment_id, "found": False, "canonical_source": CANONICAL_SOURCE}

    equipment = ctx.get("equipment") or {}
    equipment_name = equipment.get("name") or ""
    health = await compute_equipment_snapshot(equipment_id, equipment_doc=equipment)

    from services.threat_observation_bridge import count_unified_open_signals_for_equipment

    open_count = await count_unified_open_signals_for_equipment(
        equipment_id,
        equipment_name=equipment_name,
        user=user,
    )

    open_threats = ctx.get("open_threats") or []
    max_threat_risk = 0.0
    for threat in open_threats:
        try:
            max_threat_risk = max(max_threat_risk, float(threat.get("risk_score") or 0))
        except (TypeError, ValueError):
            continue

    graph_edges = (ctx.get("graph") or {}).get("edges") or []
    twin = (ctx.get("twin_snapshot") or {}).get("latest") or {}
    overdue_pm = int(
        (health.get("overdue_pm") or {}).get("total")
        or twin.get("overdue_pm_count")
        or 0
    )
    health_score = twin.get("health_score") or health.get("reliability_score")
    if health_score is not None:
        try:
            health_score = float(health_score)
        except (TypeError, ValueError):
            health_score = None

    risk_level = "Low"
    if open_count >= 3 or (health_score is not None and health_score < 50):
        risk_level = "Critical"
    elif open_count >= 1 or overdue_pm > 0 or (health_score is not None and health_score < 70):
        risk_level = "High"

    exposure_score = _compute_exposure_score(
        open_count=open_count,
        health_score=health_score,
        overdue_pm=overdue_pm,
        max_threat_risk=max_threat_risk,
    )
    strategy_pct = _strategy_coverage_pct(
        ctx.get("failure_modes") or [],
        int(ctx.get("program_task_count") or 0),
        graph_edges,
    )

    return {
        "found": True,
        "canonical_source": CANONICAL_SOURCE,
        "equipment_id": equipment_id,
        "assembled_at": datetime.now(timezone.utc).isoformat(),
        # Flat fields (backward compatible)
        "health_score": health_score,
        "risk_level": risk_level,
        "open_observation_count": open_count,
        "overdue_pm_count": overdue_pm,
        "graph_edge_count": len(graph_edges),
        "graph_fingerprint": _graph_fingerprint(graph_edges),
        "program_task_count": ctx.get("program_task_count", 0),
        "strategy_version": ctx.get("strategy_version"),
        # Nested KPI ownership (Convergence 1 registry)
        "health": {"score": health_score},
        "maintenance": {"overdue_count": overdue_pm},
        "exposure": {"score": exposure_score},
        "strategy": {"coverage_pct": strategy_pct},
        "signals": {
            "open_observations": open_count > 0,
            "overdue_pm": overdue_pm > 0,
            "graph_linked_threats": ctx.get("open_threat_count", 0) > 0,
        },
    }


async def batch_equipment_reliability_states(
    equipment_ids: List[str],
    user_id: str,
    *,
    user: Optional[dict] = None,
    limit: int = 25,
) -> Dict[str, Dict[str, Any]]:
    """Build state for multiple assets (supervisor queue enrichment)."""
    unique = list(dict.fromkeys(eid for eid in equipment_ids if eid))[:limit]
    if not unique:
        return {}
    results = await asyncio.gather(
        *[build_equipment_reliability_state(eid, user_id, user=user) for eid in unique],
        return_exceptions=True,
    )
    out: Dict[str, Dict[str, Any]] = {}
    for eid, result in zip(unique, results):
        if isinstance(result, Exception):
            logger.warning("batch state failed for %s: %s", eid, result)
            out[eid] = {"equipment_id": eid, "found": False}
        else:
            out[eid] = result
    return out


async def compute_fleet_reliability_summary(
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Fleet-wide reliability KPIs — canonical source for executive and supervisor summaries.
    """
    from database import installation_filter
    from services.threat_observation_bridge import count_unified_open_signals

    now = datetime.now(timezone.utc)
    today_iso = now.date().isoformat()

    unified_open = await count_unified_open_signals(user=user)

    scope: Dict[str, Any] = {}
    if user:
        installation_ids = await installation_filter.get_user_installation_ids(user)
        if not installation_ids:
            return _empty_fleet_summary(now, unified_open=0)
        equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
            installation_ids, user.get("id")
        )
        if not equipment_ids:
            return _empty_fleet_summary(now, unified_open=0)
        scope = {"linked_equipment_id": {"$in": list(equipment_ids)}}

    high_risk_query = merge_tenant_filter(
        {
            **scope,
            "status": {"$in": OPEN_THREAT_STATUSES},
            "risk_level": {"$in": ["High", "high", "Critical", "critical"]},
        },
        user,
    )
    high_risk_threats = await db.threats.count_documents(high_risk_query)

    pm_scope: Dict[str, Any] = {}
    if scope.get("linked_equipment_id"):
        pm_scope["equipment_id"] = scope["linked_equipment_id"]

    overdue_pm_scheduled = await db.scheduled_tasks.count_documents(
        merge_tenant_filter(
            {
                **pm_scope,
                "status": {"$nin": ["completed", "cancelled"]},
                "due_date": {"$lt": today_iso},
            },
            user,
        )
    )
    overdue_pm_instances = await db.task_instances.count_documents(
        merge_tenant_filter(
            {
                **pm_scope,
                "status": {"$in": ["pending", "overdue", "scheduled"]},
                "due_date": {"$lt": now},
            },
            user,
        )
    )
    overdue_total = overdue_pm_scheduled + overdue_pm_instances

    return {
        "canonical_source": CANONICAL_SOURCE,
        "generated_at": now.isoformat(),
        "unified_open_signals": unified_open,
        "open_observation_count": unified_open,
        "open_threats": unified_open,
        "high_risk_threats": high_risk_threats,
        "overdue_pm": {
            "scheduled_tasks": overdue_pm_scheduled,
            "task_instances": overdue_pm_instances,
            "total": overdue_total,
        },
    }


def _empty_fleet_summary(now: datetime, *, unified_open: int = 0) -> Dict[str, Any]:
    return {
        "canonical_source": CANONICAL_SOURCE,
        "generated_at": now.isoformat(),
        "unified_open_signals": unified_open,
        "open_observation_count": unified_open,
        "open_threats": unified_open,
        "high_risk_threats": 0,
        "overdue_pm": {"scheduled_tasks": 0, "task_instances": 0, "total": 0},
    }
