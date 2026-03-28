"""
FMEA Definitions API routes.
Allows customization of Severity, Occurrence, and Detection tables per asset/installation.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Definitions"])


# ============= PYDANTIC MODELS =============

class DefinitionRow(BaseModel):
    """A single row in a definition table (e.g., severity rank 10)."""
    rank: int
    label: str  # e.g., "Hazardous", "Very High"
    description: str
    secondary_description: Optional[str] = None  # Additional column (e.g., manufacturing effect)
    color: Optional[str] = None  # CSS class like "bg-red-600"


class DefinitionTable(BaseModel):
    """A complete definition table (severity, occurrence, or detection)."""
    table_type: str  # "severity", "occurrence", or "detection"
    rows: List[DefinitionRow]


class DefinitionsCreate(BaseModel):
    """Create definitions for an equipment/installation."""
    equipment_id: str
    severity: List[DefinitionRow]
    occurrence: List[DefinitionRow]
    detection: List[DefinitionRow]
    criticality: Optional[List[DefinitionRow]] = None


class DefinitionsUpdate(BaseModel):
    """Update definitions."""
    severity: Optional[List[DefinitionRow]] = None
    occurrence: Optional[List[DefinitionRow]] = None
    detection: Optional[List[DefinitionRow]] = None
    criticality: Optional[List[DefinitionRow]] = None


# ============= DEFAULT DEFINITIONS =============

DEFAULT_SEVERITY = [
    {"rank": 10, "label": "Hazardous", "description": "Very high severity ranking when a potential failure mode affects safe operation and/or involves noncompliance with government regulation without warning.", "secondary_description": "May endanger operator/machine or assembly without warning.", "color": "bg-red-600"},
    {"rank": 9, "label": "Hazardous", "description": "Very high severity ranking when a potential failure mode affects safe operation and/or involves noncompliance with government regulation with warning.", "secondary_description": "May endanger operator/machine or assembly with warning.", "color": "bg-red-500"},
    {"rank": 8, "label": "Very High", "description": "Product/item inoperable (loss of primary function). Severe deviation of specified parameters.", "secondary_description": "100% of product may have to be scrapped, or product/item repaired with repair time greater than one hour.", "color": "bg-orange-500"},
    {"rank": 7, "label": "High", "description": "Product/item operable but at reduced level of performance. Customer very dissatisfied.", "secondary_description": "Product may have to be sorted and a portion scrapped, or repaired with repair time between half an hour and an hour.", "color": "bg-orange-400"},
    {"rank": 6, "label": "Moderate", "description": "Product/item operable, but Comfort/Convenience item(s) inoperable. Customer dissatisfied.", "secondary_description": "A portion of the product may have to be scrapped with no sorting, or repaired with repair time less than half an hour.", "color": "bg-yellow-500"},
    {"rank": 5, "label": "Low", "description": "Product/item operable, but Comfort/Convenience item(s) operable at a reduced level. Customer somewhat dissatisfied.", "secondary_description": "100% of product may have to be reworked, or repaired off-line.", "color": "bg-yellow-400"},
    {"rank": 4, "label": "Very Low", "description": "Fit & Finish/Squeak & Rattle items does not conform. Defect noticed by most customers (greater than 75%).", "secondary_description": "The product may have to be sorted, with no scrap, and a portion reworked.", "color": "bg-green-400"},
    {"rank": 3, "label": "Minor", "description": "Fit & Finish/Squeak & Rattle items does not conform. Defect noticed by most customers (greater than 75%).", "secondary_description": "A portion of the product may have to be reworked, with no scrap, online but out-of-station.", "color": "bg-green-500"},
    {"rank": 2, "label": "Very Minor", "description": "Fit & Finish/Squeak & Rattle items does not conform. Defect noticed by discriminating customers (less than 25%).", "secondary_description": "A portion of the product may have to be reworked, with no scrap, online but in-station.", "color": "bg-green-600"},
    {"rank": 1, "label": "None", "description": "No discernible effect.", "secondary_description": "Slight inconvenience to operation or operator, or no effect.", "color": "bg-green-700"},
]

DEFAULT_OCCURRENCE = [
    {"rank": 10, "label": "Very High", "description": "Persistent failures", "secondary_description": "≥ 100 per thousand units", "color": "bg-red-600"},
    {"rank": 9, "label": "Very High", "description": "Persistent failures", "secondary_description": "50 per thousand units", "color": "bg-red-500"},
    {"rank": 8, "label": "High", "description": "Frequent failures", "secondary_description": "20 per thousand units", "color": "bg-orange-500"},
    {"rank": 7, "label": "High", "description": "Frequent failures", "secondary_description": "10 per thousand units", "color": "bg-orange-400"},
    {"rank": 6, "label": "Moderate", "description": "Occasional failures", "secondary_description": "2 per thousand units", "color": "bg-yellow-500"},
    {"rank": 5, "label": "Moderate", "description": "Occasional failures", "secondary_description": "0.5 per thousand units", "color": "bg-yellow-400"},
    {"rank": 4, "label": "Moderate", "description": "Occasional failures", "secondary_description": "0.1 per thousand units", "color": "bg-yellow-300"},
    {"rank": 3, "label": "Low", "description": "Relatively few failures", "secondary_description": "0.01 per thousand units", "color": "bg-green-400"},
    {"rank": 2, "label": "Low", "description": "Relatively few failures", "secondary_description": "≤ 0.001 per thousand units", "color": "bg-green-500"},
    {"rank": 1, "label": "Remote", "description": "Failure is unlikely", "secondary_description": "Failure eliminated through preventive control", "color": "bg-green-600"},
]

DEFAULT_DETECTION = [
    {"rank": 10, "label": "Almost Impossible", "description": "Absolute certainty of non-detection", "secondary_description": "Cannot detect or is not checked", "color": "bg-red-600"},
    {"rank": 9, "label": "Very Remote", "description": "Controls will probably not detect", "secondary_description": "Control is achieved with indirect or random checks only", "color": "bg-red-500"},
    {"rank": 8, "label": "Remote", "description": "Controls have poor chance of detection", "secondary_description": "Control is achieved with visual inspection only", "color": "bg-orange-500"},
    {"rank": 7, "label": "Very Low", "description": "Controls have poor chance of detection", "secondary_description": "Control is achieved with double visual inspection only", "color": "bg-orange-400"},
    {"rank": 6, "label": "Low", "description": "Controls may detect", "secondary_description": "Control is achieved with charting methods, such as SPC", "color": "bg-yellow-500"},
    {"rank": 5, "label": "Moderate", "description": "Controls may detect", "secondary_description": "Control is based on variable gauging after parts have left the station", "color": "bg-yellow-400"},
    {"rank": 4, "label": "Moderately High", "description": "Controls have a good chance to detect", "secondary_description": "Error Detection in subsequent operations, or gauging on setup", "color": "bg-green-400"},
    {"rank": 3, "label": "High", "description": "Controls have a good chance to detect", "secondary_description": "Error Detection in-station, or multiple layers of acceptance", "color": "bg-green-500"},
    {"rank": 2, "label": "Very High", "description": "Controls almost certain to detect", "secondary_description": "Error Detection in-station with automatic gauging", "color": "bg-green-600"},
    {"rank": 1, "label": "Very High", "description": "Controls certain to detect", "secondary_description": "Discrepant parts cannot be made - error proofed by design", "color": "bg-green-700"},
]

DEFAULT_CRITICALITY = [
    {
        "rank": 5, 
        "label": "Critical", 
        "color": "bg-red-600",
        "safety": "Fatality or permanent disability. Immediate danger to personnel.",
        "production": "Complete plant shutdown. Total loss of production capacity (100%).",
        "environment": "Major environmental disaster. Significant off-site contamination requiring regulatory notification.",
        "reputation": "International media coverage. Severe damage to company reputation. Loss of operating license possible."
    },
    {
        "rank": 4, 
        "label": "High", 
        "color": "bg-orange-500",
        "safety": "Serious injury requiring hospitalization. Lost time incident.",
        "production": "Major production loss (>50%). Extended downtime (>24 hours).",
        "environment": "Significant environmental impact. On-site contamination requiring remediation.",
        "reputation": "National media coverage. Significant customer complaints. Regulatory scrutiny."
    },
    {
        "rank": 3, 
        "label": "Medium", 
        "color": "bg-yellow-500",
        "safety": "Minor injury requiring first aid. Recordable incident.",
        "production": "Moderate production loss (25-50%). Downtime 8-24 hours.",
        "environment": "Minor environmental impact. Contained spill or emission.",
        "reputation": "Local media coverage. Customer dissatisfaction. Internal investigation required."
    },
    {
        "rank": 2, 
        "label": "Low", 
        "color": "bg-green-500",
        "safety": "Near miss or minor discomfort. No injury.",
        "production": "Minor production impact (<25%). Downtime <8 hours.",
        "environment": "Negligible environmental impact. Within permit limits.",
        "reputation": "Minor customer complaint. Internal reporting only."
    },
    {
        "rank": 1, 
        "label": "Minimal", 
        "color": "bg-green-700",
        "safety": "No safety impact. Normal operating conditions.",
        "production": "No production impact. Redundancy available.",
        "environment": "No environmental impact.",
        "reputation": "No reputational impact."
    },
]


# ============= API ENDPOINTS =============

@router.get("/definitions/defaults")
async def get_default_definitions():
    """Get the default FMEA SOD definitions."""
    return {
        "severity": DEFAULT_SEVERITY,
        "occurrence": DEFAULT_OCCURRENCE,
        "detection": DEFAULT_DETECTION,
        "criticality": DEFAULT_CRITICALITY
    }


@router.get("/definitions/equipment/{equipment_id}")
async def get_definitions_for_equipment(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get definitions for a specific equipment/installation.
    Returns custom definitions if they exist, otherwise returns defaults.
    """
    # Find custom definitions for this equipment
    definitions = await db.definitions.find_one(
        {"equipment_id": equipment_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    
    if definitions:
        return {
            "equipment_id": equipment_id,
            "is_custom": True,
            "severity": definitions.get("severity", DEFAULT_SEVERITY),
            "occurrence": definitions.get("occurrence", DEFAULT_OCCURRENCE),
            "detection": definitions.get("detection", DEFAULT_DETECTION),
            "criticality": definitions.get("criticality", DEFAULT_CRITICALITY),
            "updated_at": definitions.get("updated_at")
        }
    
    # Return defaults
    return {
        "equipment_id": equipment_id,
        "is_custom": False,
        "severity": DEFAULT_SEVERITY,
        "occurrence": DEFAULT_OCCURRENCE,
        "detection": DEFAULT_DETECTION,
        "criticality": DEFAULT_CRITICALITY,
        "updated_at": None
    }


@router.get("/definitions/installations")
async def get_installations_with_definitions(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all top-level installations that can have custom definitions.
    Also indicates which ones have custom definitions.
    """
    # Get all installations
    installations = await db.equipment_nodes.find(
        {"level": "installation", "created_by": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    # Get equipment IDs that have custom definitions
    custom_defs = await db.definitions.find(
        {"created_by": current_user["id"]},
        {"_id": 0, "equipment_id": 1}
    ).to_list(100)
    custom_ids = {d["equipment_id"] for d in custom_defs}
    
    result = []
    for inst in installations:
        result.append({
            "id": inst["id"],
            "name": inst["name"],
            "has_custom_definitions": inst["id"] in custom_ids
        })
    
    return {"installations": result}


@router.post("/definitions")
async def create_or_update_definitions(
    data: DefinitionsCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create or update custom definitions for an equipment/installation.
    """
    # Validate equipment exists
    equipment = await db.equipment_nodes.find_one(
        {"id": data.equipment_id, "created_by": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "level": 1}
    )
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Convert Pydantic models to dicts
    severity_list = [row.model_dump() for row in data.severity]
    occurrence_list = [row.model_dump() for row in data.occurrence]
    detection_list = [row.model_dump() for row in data.detection]
    criticality_list = [row.model_dump() for row in data.criticality] if data.criticality else DEFAULT_CRITICALITY
    
    # Check if definitions already exist
    existing = await db.definitions.find_one(
        {"equipment_id": data.equipment_id, "created_by": current_user["id"]}
    )
    
    if existing:
        # Update existing
        await db.definitions.update_one(
            {"equipment_id": data.equipment_id, "created_by": current_user["id"]},
            {"$set": {
                "severity": severity_list,
                "occurrence": occurrence_list,
                "detection": detection_list,
                "criticality": criticality_list,
                "equipment_name": equipment["name"],
                "updated_at": now
            }}
        )
    else:
        # Create new
        definitions_doc = {
            "id": str(uuid.uuid4()),
            "equipment_id": data.equipment_id,
            "equipment_name": equipment["name"],
            "severity": severity_list,
            "occurrence": occurrence_list,
            "detection": detection_list,
            "criticality": criticality_list,
            "created_by": current_user["id"],
            "created_at": now,
            "updated_at": now
        }
        await db.definitions.insert_one(definitions_doc)
    
    return {
        "message": "Definitions saved successfully",
        "equipment_id": data.equipment_id
    }


@router.patch("/definitions/{equipment_id}")
async def update_definitions(
    equipment_id: str,
    data: DefinitionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Partially update definitions for an equipment/installation.
    Only updates the tables that are provided.
    """
    existing = await db.definitions.find_one(
        {"equipment_id": equipment_id, "created_by": current_user["id"]}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Definitions not found for this equipment")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.severity is not None:
        update_data["severity"] = [row.model_dump() for row in data.severity]
    if data.occurrence is not None:
        update_data["occurrence"] = [row.model_dump() for row in data.occurrence]
    if data.detection is not None:
        update_data["detection"] = [row.model_dump() for row in data.detection]
    if data.criticality is not None:
        update_data["criticality"] = [row.model_dump() for row in data.criticality]
    
    await db.definitions.update_one(
        {"equipment_id": equipment_id, "created_by": current_user["id"]},
        {"$set": update_data}
    )
    
    updated = await db.definitions.find_one(
        {"equipment_id": equipment_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    
    return updated


@router.delete("/definitions/{equipment_id}")
async def delete_definitions(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete custom definitions for an equipment/installation.
    The equipment will then use default definitions.
    """
    result = await db.definitions.delete_one(
        {"equipment_id": equipment_id, "created_by": current_user["id"]}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Definitions not found")
    
    return {"message": "Definitions reset to defaults", "equipment_id": equipment_id}
