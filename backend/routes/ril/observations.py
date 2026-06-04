"""
RIL Observations API
Unified Observation Intelligence - Aggregate observations from all sources.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from auth import get_current_user
from services.ril_service import RILService
from models.ril import (
    CreateObservationRequest,
    ObservationSource, ObservationSeverity
)

router = APIRouter(prefix="/observations", tags=["RIL Observations"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.post("", response_model=dict)
async def create_observation(
    request: CreateObservationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a unified observation from any source.
    
    Sources include:
    - Manual observations
    - Operator rounds
    - Vision AI
    - Investigations
    - PM Import
    - External systems (historians, SCADA, DCS)
    - Condition monitoring systems
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    observation = await service.create_observation(owner_id, request)
    
    return {
        "success": True,
        "observation": observation.dict()
    }


@router.get("", response_model=dict)
async def list_observations(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID"),
    source: Optional[ObservationSource] = Query(None, description="Filter by source"),
    severity: Optional[ObservationSeverity] = Query(None, description="Filter by severity"),
    from_date: Optional[datetime] = Query(None, description="Start date filter"),
    to_date: Optional[datetime] = Query(None, description="End date filter"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """
    List observations with optional filtering.
    Returns unified observations from all sources.
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    observations, total = await service.get_observations(
        owner_id,
        equipment_id=equipment_id,
        source=source,
        severity=severity,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        skip=skip
    )
    
    return {
        "observations": [o.dict() for o in observations],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/{observation_id}", response_model=dict)
async def get_observation(
    observation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single observation by ID"""
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    doc = await db.ril_observations.find_one({
        "owner_id": owner_id,
        "id": observation_id
    })
    
    if not doc:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    return {"observation": doc}
