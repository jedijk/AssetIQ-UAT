"""
Threats routes
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

from .deps import db, get_current_user, serialize_doc

router = APIRouter(prefix="/threats", tags=["Threats"])


# ============= MODELS =============

class ThreatResponse(BaseModel):
    id: str
    title: str
    asset: str
    equipment_type: str
    failure_mode: str
    cause: Optional[str] = None
    impact: str
    frequency: str
    likelihood: str
    detectability: str
    risk_level: str
    risk_score: int
    rank: int
    total_threats: int
    status: str
    recommended_actions: List[str]
    created_by: str
    created_at: str
    occurrence_count: int
    image_url: Optional[str] = None
    location: Optional[str] = None


class ThreatUpdate(BaseModel):
    title: Optional[str] = None
    asset: Optional[str] = None
    equipment_type: Optional[str] = None
    failure_mode: Optional[str] = None
    cause: Optional[str] = None
    impact: Optional[str] = None
    frequency: Optional[str] = None
    likelihood: Optional[str] = None
    detectability: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    recommended_actions: Optional[List[str]] = None


# ============= HELPER FUNCTIONS =============

async def update_all_ranks(user_id: str):
    """Recalculate ranks for all open threats"""
    threats = await db.threats.find(
        {"created_by": user_id, "status": {"$ne": "Closed"}},
        {"_id": 0}
    ).sort("risk_score", -1).to_list(1000)
    
    total = len(threats)
    for idx, threat in enumerate(threats):
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {"rank": idx + 1, "total_threats": total}}
        )


def ensure_int_risk_score(threat: dict) -> dict:
    """Ensure risk_score is an integer"""
    if threat and isinstance(threat.get("risk_score"), float):
        threat["risk_score"] = int(threat["risk_score"])
    return threat


# ============= ENDPOINTS =============

@router.get("", response_model=List[ThreatResponse])
async def get_threats(
    status: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get all threats for current user"""
    query = {"created_by": current_user["id"]}
    if status:
        query["status"] = status
    
    threats = await db.threats.find(query, {"_id": 0}).sort("rank", 1).limit(limit).to_list(limit)
    return [ensure_int_risk_score(t) for t in threats]


@router.get("/top", response_model=List[ThreatResponse])
async def get_top_threats(
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Get top threats by risk score"""
    threats = await db.threats.find(
        {"created_by": current_user["id"], "status": {"$ne": "Closed"}},
        {"_id": 0}
    ).sort("risk_score", -1).limit(limit).to_list(limit)
    return [ensure_int_risk_score(t) for t in threats]


@router.get("/{threat_id}", response_model=ThreatResponse)
async def get_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific threat"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    return ensure_int_risk_score(threat)


@router.patch("/{threat_id}", response_model=ThreatResponse)
async def update_threat(
    threat_id: str,
    update: ThreatUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a threat"""
    threat = await db.threats.find_one({"id": threat_id, "created_by": current_user["id"]})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    # Recalculate risk if relevant fields changed
    risk_fields = ["likelihood", "detectability", "impact", "frequency"]
    if any(f in update_data for f in risk_fields):
        likelihood = update_data.get("likelihood", threat.get("likelihood", "Possible"))
        detectability = update_data.get("detectability", threat.get("detectability", "Moderate"))
        
        likelihood_scores = {"Rare": 1, "Unlikely": 2, "Possible": 3, "Likely": 4, "Almost Certain": 5}
        detectability_scores = {"Easy": 1, "Moderate": 2, "Difficult": 3, "Very Difficult": 4, "Almost Impossible": 5}
        
        l_score = likelihood_scores.get(likelihood, 3)
        d_score = detectability_scores.get(detectability, 2)
        risk_score = l_score * d_score * 10
        
        if risk_score >= 150:
            risk_level = "Critical"
        elif risk_score >= 100:
            risk_level = "High"
        elif risk_score >= 50:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        update_data["risk_score"] = risk_score
        update_data["risk_level"] = risk_level
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.threats.update_one({"id": threat_id}, {"$set": update_data})
        
        if "status" in update_data:
            await update_all_ranks(current_user["id"])
    
    updated = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    return ensure_int_risk_score(updated)


@router.delete("/{threat_id}")
async def delete_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a threat"""
    result = await db.threats.delete_one({"id": threat_id, "created_by": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    await update_all_ranks(current_user["id"])
    return {"message": "Threat deleted"}
