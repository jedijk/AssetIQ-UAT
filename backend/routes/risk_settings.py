"""
Risk Settings Routes.

API endpoints for managing per-installation risk calculation settings.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List
import logging

from database import db
from auth import get_current_user
from models.risk_settings import (
    RiskSettingsUpdate, 
    RiskSettingsResponse, 
    DEFAULT_RISK_SETTINGS
)
from services.threat_score_service import (
    get_risk_settings_for_installation,
    recalculate_all_for_installation
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Risk Settings"])


@router.get("/risk-settings")
async def get_all_risk_settings(
    current_user: dict = Depends(get_current_user)
) -> List[RiskSettingsResponse]:
    """Get risk settings for all installations the user has access to."""
    # Get user's assigned installations
    assigned = current_user.get("assigned_installations", [])
    is_owner = current_user.get("role") == "owner"
    
    # Get all installations
    if is_owner or not assigned:
        installations = await db.equipment_nodes.find(
            {"level": "installation"},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
    else:
        installations = await db.equipment_nodes.find(
            {"level": "installation", "name": {"$in": assigned}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
    
    # Get existing risk settings
    installation_ids = [i["id"] for i in installations]
    existing_settings = await db.risk_settings.find(
        {"installation_id": {"$in": installation_ids}},
        {"_id": 0}
    ).to_list(100)
    
    settings_map = {s["installation_id"]: s for s in existing_settings}
    
    result = []
    for inst in installations:
        settings = settings_map.get(inst["id"], {})
        result.append(RiskSettingsResponse(
            installation_id=inst["id"],
            installation_name=inst["name"],
            criticality_weight=settings.get("criticality_weight", DEFAULT_RISK_SETTINGS["criticality_weight"]),
            fmea_weight=settings.get("fmea_weight", DEFAULT_RISK_SETTINGS["fmea_weight"]),
            critical_threshold=settings.get("critical_threshold", DEFAULT_RISK_SETTINGS["critical_threshold"]),
            high_threshold=settings.get("high_threshold", DEFAULT_RISK_SETTINGS["high_threshold"]),
            medium_threshold=settings.get("medium_threshold", DEFAULT_RISK_SETTINGS["medium_threshold"]),
            updated_at=settings.get("updated_at"),
            updated_by=settings.get("updated_by")
        ))
    
    return result


@router.get("/risk-settings/{installation_id}")
async def get_risk_settings(
    installation_id: str,
    current_user: dict = Depends(get_current_user)
) -> RiskSettingsResponse:
    """Get risk settings for a specific installation."""
    # Verify installation exists
    installation = await db.equipment_nodes.find_one(
        {"id": installation_id, "level": "installation"},
        {"_id": 0, "id": 1, "name": 1}
    )
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    
    settings = await get_risk_settings_for_installation(installation_id)
    
    # Get additional metadata
    stored = await db.risk_settings.find_one(
        {"installation_id": installation_id},
        {"_id": 0}
    )
    
    return RiskSettingsResponse(
        installation_id=installation_id,
        installation_name=installation["name"],
        criticality_weight=settings["criticality_weight"],
        fmea_weight=settings["fmea_weight"],
        critical_threshold=settings["critical_threshold"],
        high_threshold=settings["high_threshold"],
        medium_threshold=settings["medium_threshold"],
        updated_at=stored.get("updated_at") if stored else None,
        updated_by=stored.get("updated_by") if stored else None
    )


@router.put("/risk-settings/{installation_id}")
async def update_risk_settings(
    installation_id: str,
    updates: RiskSettingsUpdate,
    recalculate: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """
    Update risk calculation settings for an installation.
    
    If recalculate=True (default), all observations, actions, and investigations
    for this installation will be recalculated with the new settings.
    """
    # Only owner or admin can modify risk settings
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(
            status_code=403, 
            detail="Only owners and admins can modify risk settings"
        )
    
    # Verify installation exists
    installation = await db.equipment_nodes.find_one(
        {"id": installation_id, "level": "installation"},
        {"_id": 0, "id": 1, "name": 1}
    )
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    
    # Get current settings
    current_settings = await get_risk_settings_for_installation(installation_id)
    
    # Apply updates
    update_data = updates.model_dump(exclude_unset=True)
    
    # Validate weights sum to 1.0 if both are being updated
    crit_weight = update_data.get("criticality_weight", current_settings["criticality_weight"])
    fmea_weight = update_data.get("fmea_weight", current_settings["fmea_weight"])
    
    # Auto-adjust if only one weight is provided
    if "criticality_weight" in update_data and "fmea_weight" not in update_data:
        update_data["fmea_weight"] = round(1.0 - crit_weight, 2)
    elif "fmea_weight" in update_data and "criticality_weight" not in update_data:
        update_data["criticality_weight"] = round(1.0 - fmea_weight, 2)
    
    # Validate weights sum to 1.0
    total_weight = update_data.get("criticality_weight", crit_weight) + update_data.get("fmea_weight", fmea_weight)
    if abs(total_weight - 1.0) > 0.01:
        raise HTTPException(
            status_code=400, 
            detail=f"Weights must sum to 1.0 (currently {total_weight})"
        )
    
    # Add metadata
    update_data["installation_id"] = installation_id
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    
    # Upsert settings
    await db.risk_settings.update_one(
        {"installation_id": installation_id},
        {"$set": update_data},
        upsert=True
    )
    
    logger.info(f"Risk settings updated for installation {installation_id} by {current_user['id']}: {update_data}")
    
    # Recalculate all scores if requested
    recalc_result = None
    if recalculate:
        recalc_result = await recalculate_all_for_installation(installation_id)
        logger.info(f"Recalculated scores for installation {installation_id}: {recalc_result}")
    
    # Return updated settings
    new_settings = await get_risk_settings_for_installation(installation_id)
    
    return {
        "message": "Risk settings updated successfully",
        "installation_id": installation_id,
        "installation_name": installation["name"],
        "settings": new_settings,
        "recalculation": recalc_result
    }


@router.post("/risk-settings/{installation_id}/recalculate")
async def trigger_recalculation(
    installation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger recalculation of all risk scores for an installation
    using current settings.
    """
    # Only owner or admin can trigger recalculation
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(
            status_code=403, 
            detail="Only owners and admins can trigger recalculation"
        )
    
    # Verify installation exists
    installation = await db.equipment_nodes.find_one(
        {"id": installation_id, "level": "installation"},
        {"_id": 0, "id": 1, "name": 1}
    )
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    
    result = await recalculate_all_for_installation(installation_id)
    
    return {
        "message": "Recalculation completed",
        "installation_name": installation["name"],
        **result
    }


@router.delete("/risk-settings/{installation_id}")
async def reset_risk_settings(
    installation_id: str,
    recalculate: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """
    Reset risk settings to defaults for an installation.
    """
    # Only owner can reset settings
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can reset risk settings"
        )
    
    # Delete custom settings
    result = await db.risk_settings.delete_one({"installation_id": installation_id})
    
    recalc_result = None
    if recalculate and result.deleted_count > 0:
        recalc_result = await recalculate_all_for_installation(installation_id)
    
    return {
        "message": "Risk settings reset to defaults",
        "installation_id": installation_id,
        "defaults": DEFAULT_RISK_SETTINGS,
        "recalculation": recalc_result
    }
