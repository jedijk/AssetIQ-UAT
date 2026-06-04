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
from services.ril_service import RILService

router = APIRouter(prefix="/dashboard", tags=["RIL Dashboard"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.get("/stats", response_model=dict)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user)
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
    current_user: dict = Depends(get_current_user)
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
    owner_id = current_user.get("owner_id") or current_user.get("id")
    service = get_ril_service()
    
    stats = await service.get_dashboard_stats(owner_id)
    
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
    current_user: dict = Depends(get_current_user)
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
    current_user: dict = Depends(get_current_user)
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
