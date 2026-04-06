"""
Maintenance Strategies routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import json
import logging
import os
from pathlib import Path
from database import db, failure_modes_service
from auth import get_current_user
from maintenance_strategy_models import (
    MaintenanceStrategy, CriticalityLevel, MaintenanceFrequency,
    MaintenanceStrategyCreate, MaintenanceStrategyUpdate, GenerateStrategyRequest,
    GenerateAllStrategiesRequest
)
from maintenance_strategy_generator import MaintenanceStrategyGenerator
from iso14224_models import EQUIPMENT_TYPES
from failure_modes import FAILURE_MODES_LIBRARY, find_failure_modes_flexible
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Maintenance Strategies"])

# ============= MAINTENANCE STRATEGY ENDPOINTS =============

@router.get("/maintenance-strategies")
async def list_maintenance_strategies(
    equipment_type_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all maintenance strategies, optionally filtered"""
    query = {}
    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    
    strategies = await db.maintenance_strategies.find(query, {"_id": 0}).to_list(1000)
    
    # Apply search filter if provided
    if search:
        search_lower = search.lower()
        strategies = [
            s for s in strategies
            if search_lower in s.get("equipment_type_name", "").lower()
            or search_lower in s.get("description", "").lower()
            or any(search_lower in sp.get("part_name", "").lower() for sp in s.get("spare_parts", []))
            or any(search_lower in fm.get("failure_mode_name", "").lower() for fm in s.get("failure_mode_mappings", []))
        ]
    
    return {"strategies": strategies, "total": len(strategies)}


@router.get("/maintenance-strategies/{strategy_id}")
async def get_maintenance_strategy(
    strategy_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific maintenance strategy by ID"""
    strategy = await db.maintenance_strategies.find_one({"id": strategy_id}, {"_id": 0})
    if not strategy:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    return strategy


@router.get("/maintenance-strategies/by-equipment-type/{equipment_type_id}")
async def get_strategies_by_equipment_type(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get maintenance strategy for an equipment type"""
    strategy = await db.maintenance_strategies.find_one(
        {"equipment_type_id": equipment_type_id}, 
        {"_id": 0}
    )
    return {"equipment_type_id": equipment_type_id, "strategy": strategy}


@router.post("/maintenance-strategies/generate")
async def generate_maintenance_strategy(
    request: GenerateStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Auto-generate a maintenance strategy for ALL criticality levels from FMEA data"""
    # Check if strategy already exists for this equipment type
    existing = await db.maintenance_strategies.find_one({
        "equipment_type_id": request.equipment_type_id
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Strategy already exists for {request.equipment_type_name}. Delete it first to regenerate."
        )
    
    # Get failure modes for this equipment type - use flexible matching
    failure_modes = [
        fm for fm in FAILURE_MODES_LIBRARY 
        if fm.get("equipment", "").lower() == request.equipment_type_name.lower()
        or request.equipment_type_name.lower() in fm.get("equipment", "").lower()
        or fm.get("equipment", "").lower() in request.equipment_type_name.lower()
        or (fm.get("equipment_type_ids") and request.equipment_type_id in fm.get("equipment_type_ids", []))
    ]
    
    # If no specific failure modes found, try flexible matching
    if not failure_modes:
        failure_modes = find_failure_modes_flexible(
            request.equipment_type_name, 
            equipment_type=request.equipment_type_name,
            limit=15
        )
    
    # Generate strategy using AI
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI API key not configured")
    
    try:
        generator = MaintenanceStrategyGenerator(api_key)
        strategy = await generator.generate_strategy(
            equipment_type_id=request.equipment_type_id,
            equipment_type_name=request.equipment_type_name,
            failure_modes=failure_modes,
            user_id=current_user.get("user_id", "unknown")
        )
        
        # Check if strategy generation returned a default (fallback) strategy due to error
        if strategy.description and "AI generation failed" in strategy.description:
            error_msg = strategy.description
            if "Budget has been exceeded" in error_msg or "budget" in error_msg.lower():
                raise HTTPException(
                    status_code=402, 
                    detail="LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
                )
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Save to database
        strategy_dict = strategy.model_dump()
        await db.maintenance_strategies.insert_one(strategy_dict)
        
        # Remove MongoDB _id before returning
        if "_id" in strategy_dict:
            del strategy_dict["_id"]
        
        return strategy_dict
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        if "Budget has been exceeded" in error_str or "budget" in error_str.lower():
            raise HTTPException(
                status_code=402, 
                detail="LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
            )
        raise HTTPException(status_code=500, detail=f"Strategy generation failed: {error_str[:200]}")


@router.post("/maintenance-strategies/generate-all")
async def generate_all_maintenance_strategies(
    request: GenerateAllStrategiesRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate maintenance strategies for ALL equipment types"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI API key not configured")
    
    generator = MaintenanceStrategyGenerator(api_key)
    
    # Get all equipment types (EQUIPMENT_TYPES is already a list)
    equipment_types = EQUIPMENT_TYPES
    
    results = {"generated": [], "skipped": [], "failed": []}
    
    for eq_type in equipment_types:
        eq_id = eq_type.get("id", "")
        eq_name = eq_type.get("name", "")
        
        # Check if strategy already exists
        existing = await db.maintenance_strategies.find_one({"equipment_type_id": eq_id})
        if existing:
            results["skipped"].append({"id": eq_id, "name": eq_name, "reason": "Already exists"})
            continue
        
        try:
            # Get failure modes for this equipment type - use flexible matching
            failure_modes = [
                fm for fm in FAILURE_MODES_LIBRARY 
                if fm.get("equipment", "").lower() == eq_name.lower()
                or eq_name.lower() in fm.get("equipment", "").lower()
                or fm.get("equipment", "").lower() in eq_name.lower()
                or (fm.get("equipment_type_ids") and eq_id in fm.get("equipment_type_ids", []))
            ]
            
            # If no specific failure modes found, try flexible matching
            if not failure_modes:
                failure_modes = find_failure_modes_flexible(
                    eq_name, 
                    equipment_type=eq_name,
                    limit=10
                )
            
            strategy = await generator.generate_strategy(
                equipment_type_id=eq_id,
                equipment_type_name=eq_name,
                failure_modes=failure_modes,
                user_id=current_user.get("user_id", "unknown")
            )
            
            strategy_dict = strategy.model_dump()
            
            # Check if strategy generation returned a default (fallback) strategy due to error
            if strategy.description and "AI generation failed" in strategy.description:
                error_msg = strategy.description
                if "Budget has been exceeded" in error_msg or "budget" in error_msg.lower():
                    # Stop processing all - budget is exceeded
                    results["failed"].append({
                        "id": eq_id, 
                        "name": eq_name, 
                        "error": "LLM budget exceeded - add balance to Universal Key"
                    })
                    # Return early with budget exceeded message
                    return {
                        "total_equipment_types": len(equipment_types),
                        "generated": len(results["generated"]),
                        "skipped": len(results["skipped"]),
                        "failed": len(results["failed"]),
                        "details": results,
                        "error": "LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
                    }
                results["failed"].append({"id": eq_id, "name": eq_name, "error": error_msg[:100]})
                continue
            
            await db.maintenance_strategies.insert_one(strategy_dict)
            
            results["generated"].append({"id": eq_id, "name": eq_name})
            
        except Exception as e:
            error_str = str(e)
            if "Budget has been exceeded" in error_str or "budget" in error_str.lower():
                results["failed"].append({
                    "id": eq_id, 
                    "name": eq_name, 
                    "error": "LLM budget exceeded"
                })
                return {
                    "total_equipment_types": len(equipment_types),
                    "generated": len(results["generated"]),
                    "skipped": len(results["skipped"]),
                    "failed": len(results["failed"]),
                    "details": results,
                    "error": "LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
                }
            results["failed"].append({"id": eq_id, "name": eq_name, "error": error_str[:100]})
    
    return {
        "total_equipment_types": len(equipment_types),
        "generated": len(results["generated"]),
        "skipped": len(results["skipped"]),
        "failed": len(results["failed"]),
        "details": results
    }


@router.post("/maintenance-strategies")
async def create_maintenance_strategy(
    data: MaintenanceStrategyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new maintenance strategy manually"""
    # Check if strategy already exists
    existing = await db.maintenance_strategies.find_one({
        "equipment_type_id": data.equipment_type_id
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Strategy already exists for this equipment type"
        )
    
    strategy = MaintenanceStrategy(
        id=str(uuid.uuid4()),
        equipment_type_id=data.equipment_type_id,
        equipment_type_name=data.equipment_type_name,
        description=data.description,
        created_by=current_user.get("user_id"),
        auto_generated=False
    )
    
    strategy_dict = strategy.model_dump()
    await db.maintenance_strategies.insert_one(strategy_dict)
    
    # Remove MongoDB _id before returning
    if "_id" in strategy_dict:
        del strategy_dict["_id"]
    
    return strategy_dict


@router.patch("/maintenance-strategies/{strategy_id}")
async def update_maintenance_strategy(
    strategy_id: str,
    data: MaintenanceStrategyUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing maintenance strategy"""
    strategy = await db.maintenance_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    
    update_data = {}
    
    # Handle strategies_by_criticality updates
    if data.strategies_by_criticality is not None:
        update_data["strategies_by_criticality"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in data.strategies_by_criticality]
    
    # Handle spare_parts updates
    if data.spare_parts is not None:
        update_data["spare_parts"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in data.spare_parts]
    
    # Handle failure_mode_mappings updates
    if data.failure_mode_mappings is not None:
        update_data["failure_mode_mappings"] = [m.model_dump() if hasattr(m, 'model_dump') else m for m in data.failure_mode_mappings]
    
    # Handle other fields
    if data.description is not None:
        update_data["description"] = data.description
    if data.strategy_version is not None:
        update_data["strategy_version"] = data.strategy_version
    
    if update_data:
        # Auto-increment version on significant changes
        if any(k in update_data for k in ['strategies_by_criticality', 'spare_parts', 'failure_mode_mappings']):
            current_version = strategy.get("strategy_version", "1.0")
            try:
                major, minor = map(int, current_version.split("."))
                update_data["strategy_version"] = f"{major}.{minor + 1}"
            except ValueError:
                update_data["strategy_version"] = "1.1"
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.maintenance_strategies.update_one(
            {"id": strategy_id},
            {"$set": update_data}
        )
    
    updated_strategy = await db.maintenance_strategies.find_one({"id": strategy_id}, {"_id": 0})
    return updated_strategy


@router.delete("/maintenance-strategies/{strategy_id}")
async def delete_maintenance_strategy(
    strategy_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a maintenance strategy"""
    result = await db.maintenance_strategies.delete_one({"id": strategy_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    return {"message": "Maintenance strategy deleted", "id": strategy_id}


@router.post("/maintenance-strategies/{strategy_id}/increment-version")
async def increment_strategy_version(
    strategy_id: str,
    major: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Increment the strategy version number"""
    strategy = await db.maintenance_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    
    current_version = strategy.get("strategy_version", "1.0")
    major_v, minor_v = map(int, current_version.split("."))
    
    if major:
        new_version = f"{major_v + 1}.0"
    else:
        new_version = f"{major_v}.{minor_v + 1}"
    
    await db.maintenance_strategies.update_one(
        {"id": strategy_id},
        {"$set": {
            "strategy_version": new_version,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"id": strategy_id, "new_version": new_version}

# Document download endpoint
@router.get("/download/documentation")
async def download_documentation():
    """Download the AssetIQ Architecture & Cost Documentation"""
    file_path = Path(__file__).parent.parent / "AssetIQ_Architecture_Cost_Documentation.docx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Documentation file not found")
    return FileResponse(
        path=str(file_path),
        filename="AssetIQ_Architecture_Cost_Documentation.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

@router.get("/download/functional-spec")
async def download_functional_spec():
    """Download the AssetIQ Functional Specification Document"""
    file_path = Path(__file__).parent.parent / "AssetIQ_Functional_Specification.docx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Functional specification file not found")
    return FileResponse(
        path=str(file_path),
        filename="AssetIQ_Functional_Specification.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )



