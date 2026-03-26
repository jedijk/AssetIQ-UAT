"""
Equipment Failure Modes routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import logging
from database import db, efm_service
from auth import get_current_user
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Equipment Failure Modes"])

# ============= EQUIPMENT FAILURE MODES (EFM) ENDPOINTS =============

class EFMUpdate(BaseModel):
    likelihood: Optional[int] = None
    detectability: Optional[int] = None
    severity: Optional[int] = None
    is_active: Optional[bool] = None
    override_reason: Optional[str] = None

@router.get("/equipment/{equipment_id}/efms")
async def get_equipment_efms(
    equipment_id: str,
    active_only: bool = True,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all Equipment Failure Modes (EFMs) for a specific equipment."""
    # Verify equipment exists and belongs to user
    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id, "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    efms = await efm_service.get_efms_for_equipment(
        equipment_id=equipment_id,
        active_only=active_only,
        category=category
    )
    
    return {
        "equipment_id": equipment_id,
        "equipment_name": equipment.get("name"),
        "total": len(efms),
        "efms": efms
    }

@router.get("/equipment/{equipment_id}/efms/summary")
async def get_equipment_efm_summary(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get summary statistics for an equipment's EFMs."""
    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id, "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    summary = await efm_service.get_efm_summary_for_equipment(equipment_id)
    summary["equipment_name"] = equipment.get("name")
    
    return summary

@router.get("/equipment/{equipment_id}/risk")
async def get_equipment_risk(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Calculate aggregated risk metrics for an equipment based on its EFMs."""
    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id, "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    risk = await efm_service.calculate_equipment_risk(equipment_id)
    risk["equipment_name"] = equipment.get("name")
    
    return risk

@router.post("/equipment/{equipment_id}/efms/generate")
async def generate_efms_for_equipment(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Manually trigger EFM generation for an equipment (if not already generated)."""
    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id, "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    if not equipment.get("equipment_type_id"):
        raise HTTPException(
            status_code=400, 
            detail="Equipment must have an equipment_type_id to generate EFMs"
        )
    
    efms = await efm_service.generate_efms_for_equipment(
        equipment_id=equipment_id,
        equipment_name=equipment.get("name"),
        equipment_type_id=equipment.get("equipment_type_id")
    )
    
    return {
        "equipment_id": equipment_id,
        "generated": len(efms),
        "efms": efms
    }

@router.get("/efms/high-risk")
async def get_high_risk_efms(
    equipment_id: Optional[str] = None,
    min_rpn: int = 150,
    current_user: dict = Depends(get_current_user)
):
    """Get EFMs with high RPN values across all equipment or for specific equipment."""
    if equipment_id:
        equipment = await db.equipment_nodes.find_one(
            {"id": equipment_id, "created_by": current_user["id"]}
        )
        if not equipment:
            raise HTTPException(status_code=404, detail="Equipment not found")
    
    efms = await efm_service.get_high_risk_efms(
        equipment_id=equipment_id,
        min_rpn=min_rpn
    )
    
    return {
        "min_rpn": min_rpn,
        "total": len(efms),
        "efms": efms
    }

@router.get("/efms/{efm_id}")
async def get_efm_by_id(
    efm_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific EFM by ID."""
    efm = await efm_service.get_efm_by_id(efm_id)
    if not efm:
        raise HTTPException(status_code=404, detail="EFM not found")
    
    # Verify equipment belongs to user
    equipment = await db.equipment_nodes.find_one(
        {"id": efm["equipment_id"], "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="EFM not found")
    
    return efm

@router.patch("/efms/{efm_id}")
async def update_efm(
    efm_id: str,
    data: EFMUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an EFM's values (override from template)."""
    # Get EFM first to verify ownership
    efm = await efm_service.get_efm_by_id(efm_id)
    if not efm:
        raise HTTPException(status_code=404, detail="EFM not found")
    
    equipment = await db.equipment_nodes.find_one(
        {"id": efm["equipment_id"], "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="EFM not found")
    
    # Validate ranges
    if data.likelihood is not None and not (1 <= data.likelihood <= 10):
        raise HTTPException(status_code=400, detail="Likelihood must be between 1-10")
    if data.detectability is not None and not (1 <= data.detectability <= 10):
        raise HTTPException(status_code=400, detail="Detectability must be between 1-10")
    if data.severity is not None and not (1 <= data.severity <= 10):
        raise HTTPException(status_code=400, detail="Severity must be between 1-10")
    
    updated = await efm_service.update_efm(
        efm_id=efm_id,
        likelihood=data.likelihood,
        detectability=data.detectability,
        severity=data.severity,
        is_active=data.is_active,
        override_reason=data.override_reason
    )
    
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update EFM")
    
    return updated

@router.post("/efms/{efm_id}/reset")
async def reset_efm_to_template(
    efm_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Reset an EFM's values back to the template defaults."""
    efm = await efm_service.get_efm_by_id(efm_id)
    if not efm:
        raise HTTPException(status_code=404, detail="EFM not found")
    
    equipment = await db.equipment_nodes.find_one(
        {"id": efm["equipment_id"], "created_by": current_user["id"]}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="EFM not found")
    
    updated = await efm_service.reset_efm_to_template(efm_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to reset EFM")
    
    return updated

# ============= TASK MANAGEMENT ENDPOINTS =============

# --- Task Templates ---


