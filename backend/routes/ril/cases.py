"""
RIL Cases API
Reliability Case Management - Single container for reliability issues.

A Reliability Case contains:
- Observations
- Evidence
- Risk assessment
- Actions
- Investigation
- Prediction
- Resolution history
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from auth import get_current_user
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service import RILService
from models.ril import (
    CreateReliabilityCaseRequest,
    UpdateReliabilityCaseRequest, CaseStatus, AlertPriority
)

router = APIRouter(prefix="/cases", tags=["RIL Cases"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.post("", response_model=dict)
async def create_case(
    request: CreateReliabilityCaseRequest,
    current_user: dict = Depends(_ril_write)
):
    """
    Create a new reliability case.
    
    A reliability case is the single container for reliability issues.
    It can be created from:
    - Manual creation
    - Correlation results
    - Alert escalation
    - Observation investigation
    
    The case will automatically:
    - Generate a case number (e.g., RC-2026-0001)
    - Calculate initial risk assessment
    - Link to provided observations and alerts
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    case = await service.create_reliability_case(owner_id, request)
    
    return {
        "success": True,
        "case": case.dict()
    }


@router.get("", response_model=dict)
async def list_cases(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID"),
    status: Optional[CaseStatus] = Query(None, description="Filter by status"),
    priority: Optional[AlertPriority] = Query(None, description="Filter by priority"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read)
):
    """
    List reliability cases with optional filtering.
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    cases, total = await service.get_reliability_cases(
        owner_id,
        equipment_id=equipment_id,
        status=status,
        priority=priority,
        limit=limit,
        skip=skip
    )
    
    return {
        "cases": [c.dict() for c in cases],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/{case_id}", response_model=dict)
async def get_case(
    case_id: str,
    current_user: dict = Depends(_ril_read)
):
    """Get a single reliability case by ID with full details"""
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    case = await service.get_reliability_case(owner_id, case_id)
    
    if not case:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    
    # Fetch linked data
    from database import db
    
    observations = []
    if case.observation_ids:
        async for obs in db.ril_observations.find({"id": {"$in": case.observation_ids}}):
            obs.pop('_id', None)  # Remove MongoDB ObjectId
            observations.append(obs)
    
    alerts = []
    if case.alert_ids:
        async for alert in db.ril_alerts.find({"id": {"$in": case.alert_ids}}):
            alert.pop('_id', None)  # Remove MongoDB ObjectId
            alerts.append(alert)
    
    # Get equipment details
    equipment = None
    if case.equipment_id:
        equipment = await db.equipment_nodes.find_one({"id": case.equipment_id})
        if equipment:
            equipment.pop('_id', None)  # Remove MongoDB ObjectId
    
    return {
        "case": case.dict(),
        "observations": observations,
        "alerts": alerts,
        "equipment": equipment
    }


@router.patch("/{case_id}", response_model=dict)
async def update_case(
    case_id: str,
    request: UpdateReliabilityCaseRequest,
    current_user: dict = Depends(_ril_write)
):
    """
    Update a reliability case.
    
    Updates can include:
    - Title, description
    - Status changes (with history tracking)
    - Priority
    - Assignment
    - Resolution details
    - Root cause and corrective actions
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    user_id = current_user.get("id")
    
    case = await service.update_reliability_case(owner_id, case_id, request, user_id)
    
    if not case:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    
    return {
        "success": True,
        "case": case.dict()
    }


@router.post("/{case_id}/link-observation", response_model=dict)
async def link_observation_to_case(
    case_id: str,
    observation_id: str,
    current_user: dict = Depends(_ril_write)
):
    """Link an observation to a reliability case"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Update case
    result = await db.ril_cases.update_one(
        {"owner_id": owner_id, "id": case_id},
        {
            "$addToSet": {"observation_ids": observation_id},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    
    # Update observation
    await db.ril_observations.update_one(
        {"id": observation_id},
        {"$set": {"reliability_case_id": case_id}}
    )
    
    return {"success": True, "message": "Observation linked to case"}


@router.post("/{case_id}/link-alert", response_model=dict)
async def link_alert_to_case(
    case_id: str,
    alert_id: str,
    current_user: dict = Depends(_ril_write)
):
    """Link an alert to a reliability case"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Update case
    result = await db.ril_cases.update_one(
        {"owner_id": owner_id, "id": case_id},
        {
            "$addToSet": {"alert_ids": alert_id},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    
    # Update alert
    await db.ril_alerts.update_one(
        {"id": alert_id},
        {"$set": {"reliability_case_id": case_id}}
    )
    
    return {"success": True, "message": "Alert linked to case"}


@router.post("/{case_id}/link-investigation", response_model=dict)
async def link_investigation_to_case(
    case_id: str,
    investigation_id: str,
    current_user: dict = Depends(_ril_write)
):
    """Link an AssetIQ investigation to a reliability case"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    result = await db.ril_cases.update_one(
        {"owner_id": owner_id, "id": case_id},
        {
            "$set": {
                "investigation_id": investigation_id,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reliability case not found")
    
    return {"success": True, "message": "Investigation linked to case"}
