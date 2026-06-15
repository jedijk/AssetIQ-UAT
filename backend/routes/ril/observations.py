"""RIL Observations API."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from models.ril import CreateObservationRequest, ObservationSource, ObservationSeverity
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_ril_service, ril_owner_id

router = APIRouter(prefix="/observations", tags=["RIL Observations"])


@router.post("", response_model=dict)
async def create_observation(
    request: CreateObservationRequest,
    current_user: dict = Depends(_ril_write),
):
    service = get_ril_service(current_user)
    observation = await service.create_observation(ril_owner_id(current_user), request)
    return {"success": True, "observation": observation.dict()}


@router.get("", response_model=dict)
async def list_observations(
    equipment_id: Optional[str] = Query(None),
    source: Optional[ObservationSource] = Query(None),
    severity: Optional[ObservationSeverity] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read),
):
    service = get_ril_service(current_user)
    owner_id = ril_owner_id(current_user)
    observations, total = await service.get_observations(
        owner_id,
        equipment_id=equipment_id,
        source=source,
        severity=severity,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        skip=skip,
    )
    return {
        "observations": [o.dict() for o in observations],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.get("/{observation_id}", response_model=dict)
async def get_observation(
    observation_id: str,
    current_user: dict = Depends(_ril_read),
):
    doc = await get_ril_service(current_user).get_observation_doc(
        ril_owner_id(current_user),
        observation_id,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Observation not found")
    return {"observation": doc}
