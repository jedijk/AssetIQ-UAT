"""
RIL Dashboard API
Dashboard statistics and KPIs for Reliability Intelligence Layer.

Executive Dashboard KPIs:
- Reliability Score
- Risk Exposure
- Predicted Failures
- Cost Avoided
- MTBF
- MTTR
- Availability
- Backlog Health

Intelligence Dashboard:
- Correlation Insights
- Emerging Risks
- Fleet Intelligence
- Failure Predictions
- AI Recommendations
"""

from fastapi import APIRouter, Depends
from datetime import datetime, timedelta
from auth import get_current_user
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service import RILService

router = APIRouter(prefix="/dashboard", tags=["RIL Dashboard"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.get("/stats", response_model=dict)
async def get_dashboard_stats(
    current_user: dict = Depends(_ril_read)
):
    """
    Get main RIL dashboard statistics.
    
    Returns:
    - Open cases by priority
    - Observations this week
    - Alerts this week
    - Active correlations
    - Pending recommendations
    - Cases resolved this month
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    stats = await service.get_dashboard_stats(owner_id)
    
    return {
        "success": True,
        "stats": stats,
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/executive", response_model=dict)
async def get_executive_dashboard(
    current_user: dict = Depends(_ril_read)
):
    """
    Get executive-level KPIs.
    
    Returns:
    - Reliability Score (0-100)
    - Risk Exposure (count of high-risk equipment)
    - Predicted Failures (count)
    - Cases by Status
    - Trend indicators
    """
    from database import db
    from services.executive_reliability_kpis import compute_executive_reliability_kpis
    from services.reliability_graph_query import count_active_reliability_edges

    owner_id = current_user.get("owner_id") or current_user.get("id")
    service = get_ril_service()
    
    stats = await service.get_dashboard_stats(owner_id)
    reliability_kpis = await compute_executive_reliability_kpis(owner_id, user=current_user)
    
    # Calculate reliability score
    # Based on ratio of resolved cases, low alert volume, few predictions at risk
    base_score = 85
    
    # Deduct for open P1/P2 cases
    case_penalty = (stats.get("p1_cases", 0) * 5) + (stats.get("p2_cases", 0) * 2)
    
    # Deduct for high alert volume
    alert_penalty = min(stats.get("alerts_7d", 0) * 0.5, 10)
    
    reliability_score = max(0, min(100, base_score - case_penalty - alert_penalty))
    
    # Count equipment at risk (from predictions)
    at_risk_count = await db.ril_predictions.count_documents({
        "owner_id": owner_id,
        "overall_health_score": {"$lt": 70}
    })

    open_threats = reliability_kpis.get("open_threats", 0)

    equipment_levels = ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"]
    total_equipment = await db.equipment_nodes.count_documents({"level": {"$in": equipment_levels}})
    strategy_equipment_types = [
        et for et in await db.equipment_type_strategies.distinct("equipment_type_id") if et
    ]
    if strategy_equipment_types:
        equipment_with_strategy = await db.equipment_nodes.count_documents({
            "level": {"$in": equipment_levels},
            "equipment_type_id": {"$in": strategy_equipment_types},
        })
    else:
        equipment_with_strategy = 0
    strategy_coverage_pct = round(
        equipment_with_strategy / max(total_equipment, 1) * 100, 1
    )

    reliability_edges_total = await count_active_reliability_edges(current_user)
    
    # Get cases by status
    cases_by_status = {}
    for status in ["open", "in_progress", "under_investigation", "resolved", "closed"]:
        count = await db.ril_cases.count_documents({
            "owner_id": owner_id,
            "status": status
        })
        cases_by_status[status] = count
    
    # Calculate trends (compare to previous week)
    two_weeks_ago = datetime.utcnow() - timedelta(days=14)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    
    # Observations trend
    obs_previous = await db.ril_observations.count_documents({
        "owner_id": owner_id,
        "created_at": {"$gte": two_weeks_ago, "$lt": seven_days_ago}
    })
    obs_current = stats.get("observations_7d", 0)
    obs_trend = "up" if obs_current > obs_previous else ("down" if obs_current < obs_previous else "stable")
    
    # Alerts trend
    alerts_previous = await db.ril_alerts.count_documents({
        "owner_id": owner_id,
        "alert_time": {"$gte": two_weeks_ago, "$lt": seven_days_ago}
    })
    alerts_current = stats.get("alerts_7d", 0)
    alerts_trend = "up" if alerts_current > alerts_previous else ("down" if alerts_current < alerts_previous else "stable")
    
    return {
        "reliability_score": round(reliability_score, 1),
        "risk_exposure": at_risk_count,
        "predicted_failures": at_risk_count,  # Equipment with low health score
        "open_threats": open_threats,
        "high_risk_threats": reliability_kpis.get("high_risk_threats", 0),
        "overdue_pm": reliability_kpis.get("overdue_pm", {}),
        "mtbf_proxy": reliability_kpis.get("mtbf_proxy", {}),
        "strategy_coverage_pct": strategy_coverage_pct,
        "reliability_edges_total": reliability_edges_total,
        "open_cases": stats.get("open_cases", 0),
        "p1_cases": stats.get("p1_cases", 0),
        "p2_cases": stats.get("p2_cases", 0),
        "cases_by_status": cases_by_status,
        "cases_resolved_30d": stats.get("cases_resolved_30d", 0),
        "trends": {
            "observations": {"current": obs_current, "previous": obs_previous, "direction": obs_trend},
            "alerts": {"current": alerts_current, "previous": alerts_previous, "direction": alerts_trend}
        },
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/intelligence", response_model=dict)
async def get_intelligence_dashboard(
    current_user: dict = Depends(_ril_read)
):
    """
    Get intelligence dashboard data.
    
    Returns:
    - Recent correlations
    - Emerging risks
    - Fleet insights
    - Pending recommendations
    """
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Recent correlations
    correlations = []
    async for doc in db.ril_correlations.find(
        {"owner_id": owner_id, "is_active": True}
    ).sort("created_at", -1).limit(5):
        doc.pop('_id', None)  # Remove MongoDB ObjectId
        correlations.append(doc)
    
    # Emerging risks (recent high-severity observations)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    emerging_risks = []
    async for doc in db.ril_observations.find({
        "owner_id": owner_id,
        "severity": {"$in": ["critical", "high"]},
        "created_at": {"$gte": seven_days_ago}
    }).sort("risk_score", -1).limit(5):
        doc.pop('_id', None)  # Remove MongoDB ObjectId
        emerging_risks.append(doc)
    
    # Fleet insights (equipment type statistics)
    pipeline = [
        {"$match": {"owner_id": owner_id}},
        {"$group": {
            "_id": "$equipment_type_id",
            "count": {"$sum": 1},
            "avg_health": {"$avg": "$overall_health_score"}
        }},
        {"$sort": {"avg_health": 1}},
        {"$limit": 5}
    ]
    fleet_insights = []
    async for doc in db.ril_predictions.aggregate(pipeline):
        fleet_insights.append(doc)
    
    # Pending recommendations
    recommendations = []
    async for doc in db.ril_recommendations.find({
        "owner_id": owner_id,
        "status": "pending"
    }).sort("created_at", -1).limit(5):
        doc.pop('_id', None)  # Remove MongoDB ObjectId
        recommendations.append(doc)
    
    return {
        "correlations": correlations,
        "emerging_risks": emerging_risks,
        "fleet_insights": fleet_insights,
        "recommendations": recommendations,
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/data-quality", response_model=dict)
async def get_data_quality_dashboard(
    current_user: dict = Depends(_ril_read)
):
    """
    Get data quality statistics.
    
    Returns:
    - Source coverage
    - Data freshness
    - Missing data indicators
    - Confidence levels
    """
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Count by source
    pipeline = [
        {"$match": {"owner_id": owner_id}},
        {"$group": {
            "_id": "$source",
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$confidence"}
        }}
    ]
    sources = []
    async for doc in db.ril_observations.aggregate(pipeline):
        sources.append({
            "source": doc["_id"],
            "count": doc["count"],
            "avg_confidence": round(doc.get("avg_confidence", 0), 2)
        })
    
    # Data freshness (last observation/reading times)
    last_observation = await db.ril_observations.find_one(
        {"owner_id": owner_id},
        sort=[("created_at", -1)]
    )
    last_reading = await db.ril_readings.find_one(
        {"owner_id": owner_id},
        sort=[("received_at", -1)]
    )
    last_alert = await db.ril_alerts.find_one(
        {"owner_id": owner_id},
        sort=[("received_at", -1)]
    )
    
    # Equipment coverage
    total_equipment = await db.equipment_nodes.count_documents({"owner_id": owner_id})
    equipment_with_observations = await db.ril_observations.distinct(
        "equipment_id",
        {"owner_id": owner_id, "equipment_id": {"$ne": None}}
    )
    
    return {
        "source_coverage": sources,
        "data_freshness": {
            "last_observation": last_observation.get("created_at") if last_observation else None,
            "last_reading": last_reading.get("received_at") if last_reading else None,
            "last_alert": last_alert.get("received_at") if last_alert else None
        },
        "equipment_coverage": {
            "total": total_equipment,
            "with_observations": len(equipment_with_observations),
            "coverage_pct": round(len(equipment_with_observations) / max(total_equipment, 1) * 100, 1)
        },
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/equipment/{equipment_id}/reliability-edges")
async def get_equipment_reliability_edges(
    equipment_id: str,
    limit: int = 200,
    current_user: dict = Depends(_ril_read),
):
    """Traversable reliability graph edges for an equipment item."""
    from services.tenant_schema import tenant_id_from_user
    from services.reliability_graph import get_edges_for_equipment

    edges = await get_edges_for_equipment(
        equipment_id, limit=limit, tenant_id=tenant_id_from_user(current_user)
    )
    return {"equipment_id": equipment_id, "edges": edges, "total": len(edges)}


@router.get("/equipment/{equipment_id}/reliability-chain")
async def get_equipment_reliability_chain(
    equipment_id: str,
    depth: int = 5,
    limit: int = 200,
    current_user: dict = Depends(_ril_read),
):
    """Graph-backed reliability chain paths for an equipment item."""
    from services.reliability_graph_query import GraphTraversalService

    traversal = GraphTraversalService()
    chain = await traversal.get_chain(
        equipment_id, depth=depth, user=current_user, edge_limit=limit
    )
    risk = await traversal.explain_risk(equipment_id, user=current_user)
    return {
        "equipment_id": equipment_id,
        "chain": chain,
        "risk_explanation": risk,
    }


@router.get("/reliability-graph/ontology")
async def get_reliability_graph_ontology(
    current_user: dict = Depends(_ril_read),
):
    """Reliability knowledge graph ontology schema and live edge counts."""
    from services.reliability_ontology import get_reliability_ontology_payload

    payload = await get_reliability_ontology_payload(current_user)
    return {
        **payload,
        "generated_at": datetime.utcnow().isoformat(),
    }
