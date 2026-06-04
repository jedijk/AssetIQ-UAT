"""
RIL Alerts API
Intelligent Alert Triage - Automatically classify and prioritize incoming alerts.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from auth import get_current_user
from services.ril_service import RILService
from models.ril import (
    CreateAlertRequest, AlertPriority
)

router = APIRouter(prefix="/alerts", tags=["RIL Alerts"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.post("", response_model=dict)
async def create_alert(
    request: CreateAlertRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create and auto-triage an alert.
    
    The alert will be automatically classified with:
    - Priority (P1 Critical, P2 High, P3 Medium, P4 Low)
    - Response time recommendation
    - Recommended owner
    - Suggested actions
    
    Triage evaluation criteria:
    - Asset criticality
    - Failure mode severity
    - Source confidence
    - Historical behavior
    - Operational impact
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    alert = await service.create_alert(owner_id, request)
    
    return {
        "success": True,
        "alert": alert.dict(),
        "triage": alert.triage_result.dict() if alert.triage_result else None
    }


@router.get("", response_model=dict)
async def list_alerts(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID"),
    priority: Optional[AlertPriority] = Query(None, description="Filter by priority"),
    status: Optional[str] = Query(None, description="Filter by status (new, acknowledged, assigned, resolved, dismissed)"),
    from_date: Optional[datetime] = Query(None, description="Start date filter"),
    to_date: Optional[datetime] = Query(None, description="End date filter"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """
    List alerts with optional filtering.
    Returns triaged alerts sorted by time (newest first).
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    alerts, total = await service.get_alerts(
        owner_id,
        equipment_id=equipment_id,
        priority=priority,
        status=status,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        skip=skip
    )
    
    return {
        "alerts": [a.dict() for a in alerts],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/{alert_id}", response_model=dict)
async def get_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single alert by ID"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    doc = await db.ril_alerts.find_one({
        "owner_id": owner_id,
        "id": alert_id
    })
    
    if not doc:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    doc.pop('_id', None)  # Remove MongoDB ObjectId
    return {"alert": doc}


@router.patch("/{alert_id}", response_model=dict)
async def update_alert(
    alert_id: str,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update alert status or assignment"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    updates = {"updated_at": datetime.utcnow()}
    
    if status:
        updates["status"] = status
        if status == "acknowledged":
            updates["acknowledged_at"] = datetime.utcnow()
        elif status == "resolved":
            updates["resolved_at"] = datetime.utcnow()
    
    if assigned_to:
        updates["assigned_to"] = assigned_to
    
    result = await db.ril_alerts.update_one(
        {"owner_id": owner_id, "id": alert_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    updated = await db.ril_alerts.find_one({"id": alert_id})
    if updated:
        updated.pop('_id', None)  # Remove MongoDB ObjectId
    
    return {
        "success": True,
        "alert": updated
    }
