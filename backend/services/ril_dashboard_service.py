"""RIL dashboard service — Wave 8 convergence."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import db
from services.reliability_graph_query import count_active_reliability_edges
from services.ril_dashboard_materializer import get_or_compute_ril_dashboard
from services.ril_service import RILService
from services.tenant_scope import scoped


async def get_dashboard_stats(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    oid = owner_id or user.get("owner_id") or user.get("id")
    service = RILService(db)
    stats = await service.get_dashboard_stats(oid)
    return {
        "success": True,
        "stats": stats,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_executive_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    oid = owner_id or user.get("owner_id") or user.get("id")
    cached = await get_or_compute_ril_dashboard(user, oid)
    stats = cached["stats"]
    reliability_kpis = cached["reliability_kpis"]

    base_score = 85
    case_penalty = (stats.get("p1_cases", 0) * 5) + (stats.get("p2_cases", 0) * 2)
    alert_penalty = min(stats.get("alerts_7d", 0) * 0.5, 10)
    reliability_score = max(0, min(100, base_score - case_penalty - alert_penalty))

    at_risk_count = await db.ril_predictions.count_documents(scoped(user, {
        "owner_id": oid,
        "overall_health_score": {"$lt": 70},
    }))

    open_threats = reliability_kpis.get("open_threats", 0)
    equipment_levels = ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"]
    total_equipment = await db.equipment_nodes.count_documents(scoped(user, {"level": {"$in": equipment_levels}}))
    strategy_equipment_types = [
        et for et in await db.equipment_type_strategies.distinct("equipment_type_id", scoped(user, {})) if et
    ]
    if strategy_equipment_types:
        equipment_with_strategy = await db.equipment_nodes.count_documents(scoped(user, {
            "level": {"$in": equipment_levels},
            "equipment_type_id": {"$in": strategy_equipment_types},
        }))
    else:
        equipment_with_strategy = 0
    strategy_coverage_pct = round(
        equipment_with_strategy / max(total_equipment, 1) * 100, 1
    )

    reliability_edges_total = await count_active_reliability_edges(user)

    cases_by_status = {}
    for status in ["open", "in_progress", "under_investigation", "resolved", "closed"]:
        cases_by_status[status] = await db.ril_cases.count_documents(scoped(user, {
            "owner_id": oid,
            "status": status,
        }))

    now = datetime.now(timezone.utc)
    two_weeks_ago = now - timedelta(days=14)
    seven_days_ago = now - timedelta(days=7)

    obs_previous = await db.ril_observations.count_documents(scoped(user, {
        "owner_id": oid,
        "created_at": {"$gte": two_weeks_ago, "$lt": seven_days_ago},
    }))
    obs_current = stats.get("observations_7d", 0)
    obs_trend = "up" if obs_current > obs_previous else ("down" if obs_current < obs_previous else "stable")

    alerts_previous = await db.ril_alerts.count_documents(scoped(user, {
        "owner_id": oid,
        "alert_time": {"$gte": two_weeks_ago, "$lt": seven_days_ago},
    }))
    alerts_current = stats.get("alerts_7d", 0)
    alerts_trend = "up" if alerts_current > alerts_previous else ("down" if alerts_current < alerts_previous else "stable")

    overdue_pm = reliability_kpis.get("overdue_pm", {})
    mtbf_proxy = reliability_kpis.get("mtbf_proxy", {})
    high_risk_threats = reliability_kpis.get("high_risk_threats", 0)
    p1_cases = stats.get("p1_cases", 0)
    p2_cases = stats.get("p2_cases", 0)

    return {
        "reliability_score": round(reliability_score, 1),
        "risk_exposure": at_risk_count,
        "predicted_failures": at_risk_count,
        "open_threats": open_threats,
        "high_risk_threats": high_risk_threats,
        "overdue_pm": overdue_pm,
        "mtbf_proxy": mtbf_proxy,
        "strategy_coverage_pct": strategy_coverage_pct,
        "reliability_edges_total": reliability_edges_total,
        "open_cases": stats.get("open_cases", 0),
        "p1_cases": p1_cases,
        "p2_cases": p2_cases,
        "cases_by_status": cases_by_status,
        "cases_resolved_30d": stats.get("cases_resolved_30d", 0),
        "trends": {
            "observations": {"current": obs_current, "previous": obs_previous, "direction": obs_trend},
            "alerts": {"current": alerts_current, "previous": alerts_previous, "direction": alerts_trend},
        },
        "calculations": {
            "reliability_score": (
                f"Base score 85 minus penalties: P1 cases ({p1_cases}) × 5 + P2 cases ({p2_cases}) × 2 "
                f"+ alerts in last 7 days ({stats.get('alerts_7d', 0)}) × 0.5 (max 10) "
                f"= {round(reliability_score, 1)}"
            ),
            "open_cases": "Count of RIL cases with status open, in progress, or under investigation.",
            "risk_exposure": f"Equipment with predicted health score below 70 = {at_risk_count}",
            "open_threats": f"Active open observations/threats in reliability layer = {open_threats}",
            "overdue_pm": (
                f"Overdue scheduled PM tasks ({overdue_pm.get('scheduled_tasks', 0)}) "
                f"+ overdue task instances ({overdue_pm.get('task_instances', 0)}) "
                f"= {overdue_pm.get('total', 0)}"
            ),
            "mtbf_proxy": (
                f"Mean days between failures across {mtbf_proxy.get('sample_equipment_count', 0)} assets "
                f"in a {mtbf_proxy.get('window_days', 90)}-day window"
                if mtbf_proxy.get("fleet_mean_days") is not None
                else "Insufficient failure history for fleet MTBF proxy."
            ),
            "high_risk_threats": f"Open threats with critical or high risk level = {high_risk_threats}",
            "strategy_coverage_pct": (
                f"Equipment whose type has a maintenance strategy ÷ total equipment "
                f"= {equipment_with_strategy} ÷ {total_equipment} × 100 = {strategy_coverage_pct}%"
            ),
            "predicted_failures": f"Equipment with predicted health score below 70 = {at_risk_count}",
            "reliability_edges_total": f"Active tenant-scoped reliability graph edges = {reliability_edges_total}",
        },
        "generated_at": now.isoformat(),
    }


async def get_intelligence_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    oid = owner_id or user.get("owner_id") or user.get("id")
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    correlations = []
    async for doc in db.ril_correlations.find(
        scoped(user, {"owner_id": oid, "is_active": True})
    ).sort("created_at", -1).limit(5):
        doc.pop("_id", None)
        correlations.append(doc)

    emerging_risks = []
    async for doc in db.ril_observations.find(scoped(user, {
        "owner_id": oid,
        "severity": {"$in": ["critical", "high"]},
        "created_at": {"$gte": seven_days_ago},
    })).sort("risk_score", -1).limit(5):
        doc.pop("_id", None)
        emerging_risks.append(doc)

    pipeline = [
        {"$match": scoped(user, {"owner_id": oid})},
        {"$group": {
            "_id": "$equipment_type_id",
            "count": {"$sum": 1},
            "avg_health": {"$avg": "$overall_health_score"},
        }},
        {"$sort": {"avg_health": 1}},
        {"$limit": 5},
    ]
    fleet_insights = []
    async for doc in db.ril_predictions.aggregate(pipeline):
        fleet_insights.append(doc)

    recommendations = []
    async for doc in db.ril_recommendations.find(scoped(user, {
        "owner_id": oid,
        "status": "pending",
    })).sort("created_at", -1).limit(5):
        doc.pop("_id", None)
        recommendations.append(doc)

    return {
        "correlations": correlations,
        "emerging_risks": emerging_risks,
        "fleet_insights": fleet_insights,
        "recommendations": recommendations,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_data_quality_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    oid = owner_id or user.get("owner_id") or user.get("id")

    pipeline = [
        {"$match": scoped(user, {"owner_id": oid})},
        {"$group": {
            "_id": "$source",
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$confidence"},
        }},
    ]
    sources = []
    async for doc in db.ril_observations.aggregate(pipeline):
        sources.append({
            "source": doc["_id"],
            "count": doc["count"],
            "avg_confidence": round(doc.get("avg_confidence", 0), 2),
        })

    last_observation = await db.ril_observations.find_one(
        scoped(user, {"owner_id": oid}), sort=[("created_at", -1)]
    )
    last_reading = await db.ril_readings.find_one(
        scoped(user, {"owner_id": oid}), sort=[("received_at", -1)]
    )
    last_alert = await db.ril_alerts.find_one(
        scoped(user, {"owner_id": oid}), sort=[("received_at", -1)]
    )

    total_equipment = await db.equipment_nodes.count_documents(scoped(user, {"owner_id": oid}))
    equipment_with_observations = await db.ril_observations.distinct(
        "equipment_id",
        scoped(user, {"owner_id": oid, "equipment_id": {"$ne": None}}),
    )

    return {
        "source_coverage": sources,
        "data_freshness": {
            "last_observation": last_observation.get("created_at") if last_observation else None,
            "last_reading": last_reading.get("received_at") if last_reading else None,
            "last_alert": last_alert.get("received_at") if last_alert else None,
        },
        "equipment_coverage": {
            "total": total_equipment,
            "with_observations": len(equipment_with_observations),
            "coverage_pct": round(len(equipment_with_observations) / max(total_equipment, 1) * 100, 1),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
