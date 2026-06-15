"""RIL Correlations API."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_ril_service, ril_owner_id

router = APIRouter(prefix="/correlations", tags=["RIL Correlations"])


@router.post("/find", response_model=dict)
async def find_correlations(
    equipment_id: Optional[str] = Query(None),
    time_window_hours: int = Query(24, ge=1, le=168),
    current_user: dict = Depends(_ril_write),
):
    service = get_ril_service()
    correlations = await service.find_correlations(
        ril_owner_id(current_user),
        equipment_id=equipment_id,
        time_window_hours=time_window_hours,
    )
    return {
        "success": True,
        "correlations": [c.dict() for c in correlations],
        "count": len(correlations),
        "time_window_hours": time_window_hours,
    }


@router.get("", response_model=dict)
async def list_correlations(
    equipment_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read),
):
    service = get_ril_service()
    correlations, total = await service.get_correlations(
        ril_owner_id(current_user),
        equipment_id=equipment_id,
        limit=limit,
        skip=skip,
    )
    return {
        "correlations": [c.dict() for c in correlations],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.get("/{correlation_id}", response_model=dict)
async def get_correlation(
    correlation_id: str,
    current_user: dict = Depends(_ril_read),
):
    detail = await get_ril_service().get_correlation_detail(
        ril_owner_id(current_user),
        correlation_id,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Correlation not found")
    return detail
