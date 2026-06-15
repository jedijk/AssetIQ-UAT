"""RIL Predictions API."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_ril_service, ril_owner_id

router = APIRouter(prefix="/predictions", tags=["RIL Predictions"])


@router.get("", response_model=dict)
async def list_predictions(
    equipment_id: Optional[str] = Query(None),
    min_risk: Optional[float] = Query(None, ge=0, le=100),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read),
):
    service = get_ril_service(current_user)
    predictions, total = await service.get_predictions(
        ril_owner_id(current_user),
        equipment_id=equipment_id,
        limit=limit,
        skip=skip,
    )
    if min_risk is not None:
        predictions = [p for p in predictions if (100 - p.overall_health_score) >= min_risk]
    return {
        "predictions": [p.dict() for p in predictions],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.post("/generate/{equipment_id}", response_model=dict)
async def generate_prediction(
    equipment_id: str,
    current_user: dict = Depends(_ril_write),
):
    prediction = await get_ril_service(current_user).generate_prediction(
        ril_owner_id(current_user),
        equipment_id,
    )
    if not prediction:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return {"success": True, "prediction": prediction.dict()}


@router.get("/equipment/{equipment_id}", response_model=dict)
async def get_equipment_prediction(
    equipment_id: str,
    current_user: dict = Depends(_ril_read),
):
    prediction, cached = await get_ril_service(current_user).get_equipment_prediction_cached(
        ril_owner_id(current_user),
        equipment_id,
    )
    if not prediction:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return {"prediction": prediction, "cached": cached}


@router.get("/at-risk", response_model=dict)
async def get_equipment_at_risk(
    health_threshold: float = Query(70, ge=0, le=100),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(_ril_read),
):
    at_risk = await get_ril_service(current_user).get_equipment_at_risk(
        ril_owner_id(current_user),
        health_threshold=health_threshold,
        limit=limit,
    )
    return {
        "at_risk": at_risk,
        "count": len(at_risk),
        "health_threshold": health_threshold,
    }
