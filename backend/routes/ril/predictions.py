"""
RIL Predictions API
Predictive Failure Engine - Predict equipment failures before they occur.

Inputs:
- Sensor data
- Operational rounds
- Observation history
- Maintenance history
- Failure mode history
- Fleet intelligence

Outputs:
- Failure probability
- Confidence score
- Remaining useful life (RUL)
- Estimated failure date
- Recommended actions
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from auth import get_current_user
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service import RILService

router = APIRouter(prefix="/predictions", tags=["RIL Predictions"])


def get_ril_service():
    """Get RIL service instance"""
    from database import db
    return RILService(db)


@router.get("", response_model=dict)
async def list_predictions(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID"),
    min_risk: Optional[float] = Query(None, ge=0, le=100, description="Minimum risk score"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(_ril_read)
):
    """
    Get predictive failure insights.
    
    Returns predictions with:
    - Failure probability per failure mode
    - Confidence score
    - Remaining useful life (RUL)
    - Estimated failure date
    - Recommended actions
    - Fleet comparison (percentile)
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    predictions, total = await service.get_predictions(
        owner_id,
        equipment_id=equipment_id,
        limit=limit,
        skip=skip
    )
    
    # Filter by min risk if specified
    if min_risk is not None:
        predictions = [p for p in predictions if (100 - p.overall_health_score) >= min_risk]
    
    return {
        "predictions": [p.dict() for p in predictions],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.post("/generate/{equipment_id}", response_model=dict)
async def generate_prediction(
    equipment_id: str,
    current_user: dict = Depends(_ril_write)
):
    """
    Generate a new prediction for specific equipment.
    
    This analyzes:
    - Recent observations
    - Alert history
    - Maintenance records
    - Failure mode library
    - Equipment criticality
    
    And produces failure probability estimates.
    """
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    prediction = await service.generate_prediction(owner_id, equipment_id)
    
    if not prediction:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    return {
        "success": True,
        "prediction": prediction.dict()
    }


@router.get("/equipment/{equipment_id}", response_model=dict)
async def get_equipment_prediction(
    equipment_id: str,
    current_user: dict = Depends(_ril_read)
):
    """
    Get the latest prediction for specific equipment.
    If no recent prediction exists, generates a new one.
    """
    from database import db
    service = get_ril_service()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Look for recent prediction (within 7 days)
    from datetime import timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    
    doc = await db.ril_predictions.find_one({
        "owner_id": owner_id,
        "equipment_id": equipment_id,
        "calculated_at": {"$gte": week_ago}
    })
    
    if doc:
        doc.pop('_id', None)  # Remove MongoDB ObjectId
        return {"prediction": doc, "cached": True}
    
    # Generate new prediction
    prediction = await service.generate_prediction(owner_id, equipment_id)
    
    if not prediction:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    return {
        "prediction": prediction.dict(),
        "cached": False
    }


@router.get("/at-risk", response_model=dict)
async def get_equipment_at_risk(
    health_threshold: float = Query(70, ge=0, le=100, description="Health score threshold"),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(_ril_read)
):
    """
    Get list of equipment at risk (health score below threshold).
    
    Fleet Intelligence feature - compare equipment performance across the fleet.
    """
    from database import db
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Get latest prediction per equipment
    pipeline = [
        {"$match": {"owner_id": owner_id}},
        {"$sort": {"calculated_at": -1}},
        {"$group": {
            "_id": "$equipment_id",
            "latest": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$match": {"overall_health_score": {"$lt": health_threshold}}},
        {"$sort": {"overall_health_score": 1}},
        {"$limit": limit}
    ]
    
    at_risk = []
    async for doc in db.ril_predictions.aggregate(pipeline):
        doc.pop('_id', None)  # Remove MongoDB ObjectId
        at_risk.append(doc)
    
    return {
        "at_risk": at_risk,
        "count": len(at_risk),
        "health_threshold": health_threshold
    }
