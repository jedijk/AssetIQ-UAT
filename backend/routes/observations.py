"""
Observations routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from database import db, observation_service
from auth import get_current_user

router = APIRouter(tags=["Observations"])


class ObservationCreate(BaseModel):
    equipment_id: Optional[str] = None
    efm_id: Optional[str] = None
    task_id: Optional[str] = None
    failure_mode_id: Optional[str] = None
    description: str
    severity: Optional[str] = "medium"
    observation_type: Optional[str] = "general"
    media_urls: List[str] = []
    measured_values: List[dict] = []
    location: Optional[str] = None
    tags: List[str] = []


class ObservationUpdate(BaseModel):
    description: Optional[str] = None
    severity: Optional[str] = None
    observation_type: Optional[str] = None
    status: Optional[str] = None
    failure_mode_id: Optional[str] = None
    efm_id: Optional[str] = None
    media_urls: Optional[List[str]] = None
    measured_values: Optional[List[dict]] = None
    location: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("/observations")
async def get_observations(
    equipment_id: Optional[str] = None,
    efm_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get observations with optional filters."""
    from_dt = datetime.fromisoformat(from_date) if from_date else None
    to_dt = datetime.fromisoformat(to_date) if to_date else None
    
    return await observation_service.get_observations(
        equipment_id=equipment_id,
        efm_id=efm_id,
        failure_mode_id=failure_mode_id,
        severity=severity,
        status=status,
        source=source,
        from_date=from_dt,
        to_date=to_dt,
        search=search,
        skip=skip,
        limit=limit
    )

@router.get("/observations/combined")
async def get_combined_observations(
    include_threats: bool = True,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get observations from both new system and existing threats."""
    return await observation_service.get_observations_from_threats(
        user_id=current_user["id"],
        include_converted=include_threats,
        skip=skip,
        limit=limit
    )

@router.get("/observations/unlinked")
async def get_unlinked_observations(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get observations without failure mode links (need AI suggestions)."""
    return await observation_service.get_unlinked_observations(
        user_id=current_user["id"],
        limit=limit
    )

@router.get("/observations/trends")
async def get_observation_trends(
    equipment_id: Optional[str] = None,
    days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Get observation trends over time."""
    return await observation_service.get_observation_trends(
        equipment_id=equipment_id,
        days=days
    )

@router.get("/observations/{obs_id}")
async def get_observation(
    obs_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific observation."""
    obs = await observation_service.get_observation_by_id(obs_id)
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")
    return obs

@router.post("/observations")
async def create_observation(
    data: ObservationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new observation manually."""
    return await observation_service.create_observation(
        data.model_dump(),
        created_by=current_user["id"],
        source="manual"
    )

@router.patch("/observations/{obs_id}")
async def update_observation(
    obs_id: str,
    data: ObservationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an observation."""
    result = await observation_service.update_observation(
        obs_id,
        data.model_dump(exclude_unset=True)
    )
    if not result:
        raise HTTPException(status_code=404, detail="Observation not found")
    return result

@router.post("/observations/{obs_id}/close")
async def close_observation(
    obs_id: str,
    resolution_notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Close an observation."""
    result = await observation_service.close_observation(obs_id, resolution_notes)
    if not result:
        raise HTTPException(status_code=404, detail="Observation not found")
    return result


@router.delete("/observations/{obs_id}")
async def delete_observation(
    obs_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an observation. Requires admin, owner, or reliability_engineer role."""
    # Check if user has permission to delete
    if current_user.get("role") not in ["admin", "owner", "reliability_engineer"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions to delete observations")
    
    from bson import ObjectId
    
    # Try to find by ObjectId first, then by id field
    observation = None
    try:
        observation = await db.observations.find_one({"_id": ObjectId(obs_id)})
    except:
        pass
    
    if not observation:
        observation = await db.observations.find_one({"id": obs_id})
    
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # Delete the observation
    try:
        result = await db.observations.delete_one({"_id": observation["_id"]})
    except:
        result = await db.observations.delete_one({"id": obs_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Failed to delete observation")
    
    return {"status": "success", "message": "Observation deleted successfully"}

# --- AI Failure Mode Suggestions ---

class SuggestRequest(BaseModel):
    description: str
    equipment_id: Optional[str] = None
    equipment_type_id: Optional[str] = None
    max_suggestions: int = 5

@router.post("/observations/suggest-failure-modes")
async def suggest_failure_modes(
    data: SuggestRequest,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-suggested failure modes for an observation description."""
    suggestions = await observation_service.suggest_failure_modes(
        description=data.description,
        equipment_id=data.equipment_id,
        equipment_type_id=data.equipment_type_id,
        max_suggestions=data.max_suggestions
    )
    return {"suggestions": suggestions}

@router.post("/observations/{obs_id}/link-failure-mode")
async def link_failure_mode_to_observation(
    obs_id: str,
    failure_mode_id: str,
    efm_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Link a failure mode to an observation (accept AI suggestion)."""
    result = await observation_service.link_failure_mode_to_observation(
        obs_id=obs_id,
        failure_mode_id=failure_mode_id,
        efm_id=efm_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Observation or failure mode not found")
    return result

# --- Threat Conversion ---

@router.post("/threats/{threat_id}/convert-to-observation")
async def convert_threat_to_observation(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert an existing threat to the new observation format."""
    result = await observation_service.convert_threat_to_observation(threat_id)
    if not result:
        raise HTTPException(status_code=404, detail="Threat not found")
    return result

# ============= DECISION ENGINE ENDPOINTS =============

class RuleUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    auto_execute: Optional[bool] = None
    config: Optional[dict] = None

