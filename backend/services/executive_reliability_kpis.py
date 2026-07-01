"""
Executive reliability KPI aggregation — open threats, overdue PM, MTBF proxies.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db, installation_filter
from services.tenant_schema import merge_tenant_filter


async def _equipment_scope_filter(user: Optional[dict]) -> Dict[str, Any]:
    """Build a Mongo filter limiting KPIs to the user's installation scope."""
    if not user:
        return {}
    equipment_ids = await installation_filter.get_scoped_equipment_ids(user)
    if not equipment_ids:
        return {"_impossible": True}
    return {"linked_equipment_id": {"$in": list(equipment_ids)}}


async def compute_executive_reliability_kpis(
    owner_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Compute installation-wide executive KPIs."""
    from services.equipment_reliability_state_service import compute_fleet_reliability_summary

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=90)

    fleet = await compute_fleet_reliability_summary(user=user)
    scope = await _equipment_scope_filter(user)
    if user and scope.get("_impossible"):
        return {
            **fleet,
            "mtbf_proxy": {
                "fleet_mean_days": None,
                "sample_equipment_count": 0,
                "window_days": 90,
                "worst_performers": [],
            },
            "graph_kpis": {},
            "generated_at": now.isoformat(),
        }

    equipment_ids = scope.get("linked_equipment_id", {}).get("$in") if scope else None
    mtbf_by_equipment = await _mtbf_proxy_days(
        window_start, equipment_ids=equipment_ids, user=user
    )

    fleet_mtbf_days = None
    if mtbf_by_equipment:
        fleet_mtbf_days = round(
            sum(mtbf_by_equipment) / len(mtbf_by_equipment), 1
        )

    worst_equipment = await _worst_mtbf_equipment(
        window_start, limit=5, equipment_ids=equipment_ids, user=user
    )

    graph_kpis: Dict[str, Any] = {}
    try:
        from services.graph_kpi_aggregator import GraphKpiAggregator

        graph_kpis = await GraphKpiAggregator().aggregate(user=user)
    except Exception:
        graph_kpis = {}

    mtbf_from_graph = await _mtbf_from_reliability_impacts(
        window_start, equipment_ids=equipment_ids, user=user
    )

    return {
        **fleet,
        "mtbf_proxy": {
            "fleet_mean_days": mtbf_from_graph or fleet_mtbf_days,
            "sample_equipment_count": len(mtbf_by_equipment),
            "window_days": 90,
            "worst_performers": worst_equipment,
            "source": "reliability_impacts" if mtbf_from_graph else "threat_resolution",
        },
        "graph_kpis": graph_kpis,
        "generated_at": now.isoformat(),
    }


async def _mtbf_from_reliability_impacts(
    since: datetime,
    *,
    equipment_ids: Optional[List[str]] = None,
    user: Optional[dict] = None,
) -> Optional[float]:
    """Optional MTBF proxy from graph-backed reliability_impacts collection."""
    query: Dict[str, Any] = {
        "metric_type": "mtbf_proxy_days",
        "created_at": {"$gte": since.isoformat()},
    }
    if equipment_ids:
        query["equipment_id"] = {"$in": list(equipment_ids)}
    query = merge_tenant_filter(query, user)
    cursor = db.reliability_impacts.find(query, {"delta": 1})
    deltas = [doc.get("delta") for doc in await cursor.to_list(500) if doc.get("delta") is not None]
    if not deltas:
        return None
    return round(sum(deltas) / len(deltas), 1)


async def _mtbf_proxy_days(
    since: datetime,
    *,
    equipment_ids: Optional[List[str]] = None,
    user: Optional[dict] = None,
) -> List[float]:
    """Return inter-failure intervals (days) per equipment from resolved threats."""
    match: Dict[str, Any] = {
        "status": {"$in": ["Resolved", "resolved", "Closed", "closed"]},
        "created_at": {"$gte": since},
    }
    if equipment_ids:
        match["linked_equipment_id"] = {"$in": equipment_ids}
    else:
        match["linked_equipment_id"] = {"$exists": True, "$ne": None}
    match = merge_tenant_filter(match, user)
    pipeline = [
        {"$match": match},
        {"$sort": {"linked_equipment_id": 1, "created_at": 1}},
        {
            "$group": {
                "_id": "$linked_equipment_id",
                "dates": {"$push": "$created_at"},
            }
        },
    ]
    intervals: List[float] = []
    async for row in db.threats.aggregate(pipeline):
        dates = row.get("dates") or []
        if len(dates) < 2:
            continue
        parsed = []
        for d in dates:
            if isinstance(d, datetime):
                parsed.append(d if d.tzinfo else d.replace(tzinfo=timezone.utc))
        parsed.sort()
        for i in range(1, len(parsed)):
            delta = (parsed[i] - parsed[i - 1]).total_seconds() / 86400
            if delta > 0:
                intervals.append(delta)
    return intervals


async def _worst_mtbf_equipment(
    since: datetime,
    *,
    limit: int = 5,
    equipment_ids: Optional[List[str]] = None,
    user: Optional[dict] = None,
) -> List[dict]:
    """Equipment with shortest mean interval between failures (proxy)."""
    match: Dict[str, Any] = {
        "status": {"$in": ["Resolved", "resolved", "Closed", "closed"]},
        "created_at": {"$gte": since},
    }
    if equipment_ids:
        match["linked_equipment_id"] = {"$in": equipment_ids}
    else:
        match["linked_equipment_id"] = {"$exists": True, "$ne": None}
    match = merge_tenant_filter(match, user)
    pipeline = [
        {"$match": match},
        {"$sort": {"linked_equipment_id": 1, "created_at": 1}},
        {
            "$group": {
                "_id": "$linked_equipment_id",
                "failure_count": {"$sum": 1},
                "first_at": {"$min": "$created_at"},
                "last_at": {"$max": "$created_at"},
            }
        },
        {"$match": {"failure_count": {"$gte": 2}}},
        {
            "$addFields": {
                "span_days": {
                    "$divide": [
                        {"$subtract": ["$last_at", "$first_at"]},
                        86400000,
                    ]
                }
            }
        },
        {
            "$addFields": {
                "mtbf_proxy_days": {
                    "$divide": ["$span_days", {"$subtract": ["$failure_count", 1]}]
                }
            }
        },
        {"$sort": {"mtbf_proxy_days": 1}},
        {"$limit": limit},
    ]
    results = []
    async for row in db.threats.aggregate(pipeline):
        eq_id = row.get("_id")
        eq = await db.equipment_nodes.find_one(
            {"id": eq_id},
            {"_id": 0, "id": 1, "name": 1, "tag": 1},
        )
        results.append({
            "equipment_id": eq_id,
            "equipment_name": (eq or {}).get("name"),
            "equipment_tag": (eq or {}).get("tag"),
            "failure_count": row.get("failure_count"),
            "mtbf_proxy_days": round(row.get("mtbf_proxy_days") or 0, 1),
        })
    return results
