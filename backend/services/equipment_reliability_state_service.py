"""
Equipment reliability state — v1 consolidated health projection.

Aggregates open observations, PM overdue signals, and graph fingerprint without
duplicating ReliabilityContextService graph traversal logic.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db
from services.asset_health_materializer import compute_equipment_snapshot
from services.reliability_context_service import ReliabilityContextService
from services.tenant_schema import merge_tenant_filter

logger = logging.getLogger(__name__)

OPEN_THREAT_STATUSES = ["Open", "open", "In Progress", "in_progress"]


def _graph_fingerprint(edges: list) -> str:
    """Stable hash of active graph edge ids for change detection."""
    ids = sorted(
        str(e.get("id") or e.get("edge_id") or "")
        for e in (edges or [])
        if e.get("status", "active") != "retired"
    )
    payload = json.dumps(ids, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


async def build_equipment_reliability_state(
    equipment_id: str,
    user_id: str,
    *,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Return a compact reliability state snapshot for one asset."""
    ctx = await ReliabilityContextService().get_context(
        equipment_id,
        user_id,
        user=user,
        use_cache=True,
    )
    if not ctx.get("found"):
        return {"equipment_id": equipment_id, "found": False}

    equipment = ctx.get("equipment") or {}
    health = await compute_equipment_snapshot(equipment_id, equipment_doc=equipment)

    open_query = merge_tenant_filter(
        {
            "status": {"$in": OPEN_THREAT_STATUSES},
            "$or": [
                {"linked_equipment_id": equipment_id},
                {"equipment_id": equipment_id},
            ],
        },
        user,
    )
    open_count = await db.threats.count_documents(open_query)

    graph_edges = (ctx.get("graph") or {}).get("edges") or []
    twin = (ctx.get("twin_snapshot") or {}).get("latest") or {}
    overdue_pm = (
        (health.get("overdue_pm") or {}).get("total")
        or twin.get("overdue_pm_count")
        or 0
    )
    health_score = twin.get("health_score") or health.get("reliability_score")

    risk_level = "Low"
    if open_count >= 3 or (health_score is not None and health_score < 50):
        risk_level = "Critical"
    elif open_count >= 1 or overdue_pm > 0 or (health_score is not None and health_score < 70):
        risk_level = "High"

    return {
        "found": True,
        "equipment_id": equipment_id,
        "assembled_at": datetime.now(timezone.utc).isoformat(),
        "health_score": health_score,
        "risk_level": risk_level,
        "open_observation_count": open_count,
        "overdue_pm_count": overdue_pm,
        "graph_edge_count": len(graph_edges),
        "graph_fingerprint": _graph_fingerprint(graph_edges),
        "program_task_count": ctx.get("program_task_count", 0),
        "strategy_version": ctx.get("strategy_version"),
        "signals": {
            "open_observations": open_count > 0,
            "overdue_pm": overdue_pm > 0,
            "graph_linked_threats": ctx.get("open_threat_count", 0) > 0,
        },
    }
