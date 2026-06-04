"""
RIL Correlations API
Multi-Source Correlation - Automatically identify relationships between observations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from auth import get_current_user
from services.ril_service import RILService

router = APIRouter(prefix="/correlations", tags=["RIL Correlations"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.post("/find", response_model=dict)
async def find_correlations(
    equipment_id: Optional[str] = Query(None, description="Limit to specific equipment"),
    time_window_hours: int = Query(24, ge=1, le=168, description="Time window for correlation (1-168 hours)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Find correlations between observations, alerts, and readings.
    
    Features:
    - Event correlation
    - Pattern matching
    - Timeline reconstruction
    - Source confidence weighting
    - Contradiction detection
    - Cross-source validation
    
    Outputs:
    - Correlation score
    - Confidence score
    - Corroborating evidence
    - Suggested root causes
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    correlations = await service.find_correlations(
        owner_id,
        equipment_id=equipment_id,
        time_window_hours=time_window_hours
    )
    
    return {
        "success": True,
        "correlations": [c.dict() for c in correlations],
        "count": len(correlations),
        "time_window_hours": time_window_hours
    }


@router.get("", response_model=dict)
async def list_correlations(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID"),
    active_only: bool = Query(True, description="Only return active correlations"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """
    List stored correlations.
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    correlations, total = await service.get_correlations(
        owner_id,
        equipment_id=equipment_id,
        limit=limit,
        skip=skip
    )
    
    return {
        "correlations": [c.dict() for c in correlations],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/{correlation_id}", response_model=dict)
async def get_correlation(
    correlation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single correlation by ID with full details"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    doc = await db.ril_correlations.find_one({
        "owner_id": owner_id,
        "id": correlation_id
    })
    
    if not doc:
        raise HTTPException(status_code=404, detail="Correlation not found")
    
    # Fetch related observations and alerts
    observations = []
    if doc.get("observation_ids"):
        async for obs in db.ril_observations.find({"id": {"$in": doc["observation_ids"]}}):
            observations.append(obs)
    
    alerts = []
    if doc.get("alert_ids"):
        async for alert in db.ril_alerts.find({"id": {"$in": doc["alert_ids"]}}):
            alerts.append(alert)
    
    return {
        "correlation": doc,
        "observations": observations,
        "alerts": alerts
    }
