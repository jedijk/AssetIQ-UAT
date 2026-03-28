"""
Threats routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
from database import db, failure_modes_service, efm_service
from auth import get_current_user
from models.api_models import ThreatResponse, ThreatUpdate
from failure_modes import FAILURE_MODES_LIBRARY
from services.threat_score_service import calculate_rank, update_all_ranks, recalculate_threat_scores_for_asset, recalculate_threat_scores_for_failure_mode
from investigation_models import (
    InvestigationCreate, InvestigationUpdate, InvestigationStatus,
    TimelineEventCreate, EventCategory, ConfidenceLevel,
    FailureIdentificationCreate,
    CauseNodeCreate, CauseCategory,
    ActionItemCreate, ActionPriority, ActionStatus
)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Threats"])


async def generate_case_number(user_id: str) -> str:
    count = await db.investigations.count_documents({"created_by": user_id})
    year = datetime.now(timezone.utc).strftime("%Y")
    return f"INV-{year}-{count + 1:04d}"

@router.get("/threats", response_model=List[ThreatResponse])
async def get_threats(
    status: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    query = {"created_by": current_user["id"]}
    if status:
        query["status"] = status
    
    threats = await db.threats.find(query, {"_id": 0}).sort("rank", 1).limit(limit).to_list(limit)
    total_count = len(threats)
    # Ensure required fields have values and risk_score is int
    for idx, t in enumerate(threats):
        if isinstance(t.get("risk_score"), float):
            t["risk_score"] = int(t["risk_score"])
        # Ensure required string fields are not None
        if not t.get("equipment_type"):
            t["equipment_type"] = "Equipment"
        if not t.get("impact"):
            t["impact"] = "Unknown"
        if not t.get("frequency"):
            t["frequency"] = "Unknown"
        if not t.get("likelihood"):
            t["likelihood"] = "Unknown"
        if not t.get("detectability"):
            t["detectability"] = "Unknown"
        # Add required fields that may be missing
        if "rank" not in t:
            t["rank"] = idx + 1
        if "total_threats" not in t:
            t["total_threats"] = total_count
        if "recommended_actions" not in t:
            t["recommended_actions"] = []
        if "occurrence_count" not in t:
            t["occurrence_count"] = 1
        # Ensure created_at is string
        if t.get("created_at") and not isinstance(t["created_at"], str):
            t["created_at"] = t["created_at"].isoformat() if hasattr(t["created_at"], 'isoformat') else str(t["created_at"])
    return threats

@router.get("/threats/top", response_model=List[ThreatResponse])
async def get_top_threats(
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    threats = await db.threats.find(
        {"created_by": current_user["id"], "status": {"$ne": "Closed"}},
        {"_id": 0}
    ).sort("risk_score", -1).limit(limit).to_list(limit)
    total_count = len(threats)
    # Ensure required fields have values and risk_score is int
    for idx, t in enumerate(threats):
        if isinstance(t.get("risk_score"), float):
            t["risk_score"] = int(t["risk_score"])
        # Ensure required string fields are not None
        if not t.get("equipment_type"):
            t["equipment_type"] = "Equipment"
        if not t.get("impact"):
            t["impact"] = "Unknown"
        if not t.get("frequency"):
            t["frequency"] = "Unknown"
        if not t.get("likelihood"):
            t["likelihood"] = "Unknown"
        if not t.get("detectability"):
            t["detectability"] = "Unknown"
        # Add required fields that may be missing
        if "rank" not in t:
            t["rank"] = idx + 1
        if "total_threats" not in t:
            t["total_threats"] = total_count
        if "recommended_actions" not in t:
            t["recommended_actions"] = []
        if "occurrence_count" not in t:
            t["occurrence_count"] = 1
        # Ensure created_at is string
        if t.get("created_at") and not isinstance(t["created_at"], str):
            t["created_at"] = t["created_at"].isoformat() if hasattr(t["created_at"], 'isoformat') else str(t["created_at"])
    return threats


@router.post("/threats/recalculate-scores")
async def recalculate_all_threat_scores(
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate risk scores for all threats based on current criticality and FMEA data.
    Uses NEW METHODOLOGY: Risk Score = (Criticality × 0.75) + (FMEA × 0.25)
    """
    # Get all threats for this user
    threats = await db.threats.find({"created_by": current_user["id"]}).to_list(1000)
    
    if not threats:
        return {"message": "No threats found", "updated_count": 0}
    
    # Get all equipment nodes (they're stored flat in MongoDB, not nested)
    equipment_nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "criticality": 1}
    ).to_list(1000)
    
    # Build asset name -> (node_id, criticality) lookup
    # Use lowercase for case-insensitive matching
    asset_data = {}
    for node in equipment_nodes:
        name_lower = node["name"].lower()
        asset_data[name_lower] = {
            "id": node["id"],
            "name": node["name"],
            "criticality": node.get("criticality")
        }
    
    logger.info(f"Found {len(asset_data)} equipment nodes for matching")
    
    updated_count = 0
    linked_count = 0
    
    for threat in threats:
        # Get FMEA score from linked failure mode
        failure_mode_name = threat.get("failure_mode")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        
        if failure_mode_name and failure_mode_name != "Unknown":
            for fm in FAILURE_MODES_LIBRARY:
                if fm["failure_mode"].lower() == failure_mode_name.lower():
                    # Calculate FMEA score from RPN
                    fmea_score = min(100, int(fm["rpn"] / 10))
                    break
        
        # Get criticality data from asset (case-insensitive match)
        asset_name = threat.get("asset", "")
        asset_name_lower = asset_name.lower() if asset_name else ""
        
        linked_equipment_id = threat.get("linked_equipment_id")  # Preserve existing link
        criticality_level = "low"
        criticality_score = 0
        criticality_data = None
        
        # Look up equipment by name
        if asset_name_lower and asset_name_lower in asset_data:
            node_info = asset_data[asset_name_lower]
            linked_equipment_id = node_info["id"]
            linked_count += 1
            crit = node_info.get("criticality")
            if crit:
                criticality_level = crit.get("level", "low")
                
                # Calculate 4-Dimension Criticality Score
                safety_impact = crit.get("safety_impact", 0) or 0
                production_impact = crit.get("production_impact", 0) or 0
                environmental_impact = crit.get("environmental_impact", 0) or 0
                reputation_impact = crit.get("reputation_impact", 0) or 0
                
                criticality_score = (
                    (safety_impact * 25) + 
                    (production_impact * 20) + 
                    (environmental_impact * 15) + 
                    (reputation_impact * 10)
                ) / 3.5
                criticality_score = min(100, int(criticality_score))
                
                criticality_data = {
                    "safety_impact": safety_impact,
                    "production_impact": production_impact,
                    "environmental_impact": environmental_impact,
                    "reputation_impact": reputation_impact,
                    "level": criticality_level,
                    "criticality_score": criticality_score
                }
        
        # NEW METHODOLOGY: Risk Score = (Criticality × 0.75) + (FMEA × 0.25)
        final_risk_score = int((criticality_score * 0.75) + (fmea_score * 0.25))
        final_risk_score = min(100, max(0, final_risk_score))
        
        # Determine risk level
        if final_risk_score >= 70:
            risk_level = "Critical"
        elif final_risk_score >= 50:
            risk_level = "High"
        elif final_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        # Update threat with full criticality data
        update_fields = {
            "risk_score": final_risk_score,
            "fmea_score": fmea_score,
            "criticality_score": criticality_score,
            "base_risk_score": fmea_score,
            "risk_level": risk_level,
            "equipment_criticality": criticality_level
        }
        if linked_equipment_id:
            update_fields["linked_equipment_id"] = linked_equipment_id
        if criticality_data:
            update_fields["equipment_criticality_data"] = criticality_data
        
        await db.threats.update_one({"id": threat["id"]}, {"$set": update_fields})
        updated_count += 1
    
    logger.info(f"Updated {updated_count} threats, linked {linked_count} to equipment")
    
    # Update all ranks
    await update_all_ranks(current_user["id"])
    
    return {
        "message": f"Successfully recalculated {updated_count} threat scores",
        "updated_count": updated_count
    }

@router.get("/threats/{threat_id}", response_model=ThreatResponse)
async def get_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Auto-sync criticality from linked equipment if available
    linked_equipment_id = threat.get("linked_equipment_id")
    asset_name = threat.get("asset")
    
    # Try to find linked equipment node
    equipment_node = None
    if linked_equipment_id:
        equipment_node = await db.equipment_nodes.find_one(
            {"id": linked_equipment_id, "created_by": current_user["id"]}
        )
    elif asset_name:
        # Fallback: try to find by asset name
        equipment_node = await db.equipment_nodes.find_one(
            {"name": asset_name, "created_by": current_user["id"]}
        )
    
    # Auto-sync FMEA score from linked failure mode
    failure_mode_name = threat.get("failure_mode")
    failure_mode_id = threat.get("failure_mode_id")
    fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
    fmea_changed = False
    
    if failure_mode_name and failure_mode_name != "Unknown":
        # Look up current failure mode data
        for fm in FAILURE_MODES_LIBRARY:
            if (failure_mode_id and fm["id"] == failure_mode_id) or \
               fm["failure_mode"].lower() == failure_mode_name.lower():
                # Calculate current FMEA score from failure mode
                current_fmea = min(100, int((fm["severity"] * fm["occurrence"] * fm["detectability"]) / 10))
                if current_fmea != fmea_score:
                    fmea_score = current_fmea
                    fmea_changed = True
                    logger.info(f"Auto-synced FMEA score for threat {threat_id}: {fmea_score}")
                break
    
    # Calculate criticality score from equipment
    new_criticality_score = threat.get("criticality_score", 0)
    criticality_level = threat.get("equipment_criticality", "low")
    criticality_data = threat.get("equipment_criticality_data")
    criticality_changed = False
    
    if equipment_node and equipment_node.get("criticality"):
        criticality = equipment_node["criticality"]
        safety_impact = criticality.get("safety_impact", 0) or 0
        production_impact = criticality.get("production_impact", 0) or 0
        environmental_impact = criticality.get("environmental_impact", 0) or 0
        reputation_impact = criticality.get("reputation_impact", 0) or 0
        
        # Calculate criticality score
        calc_criticality_score = (
            (safety_impact * 25) + 
            (production_impact * 20) + 
            (environmental_impact * 15) + 
            (reputation_impact * 10)
        ) / 3.5
        calc_criticality_score = min(100, int(calc_criticality_score))
        
        if calc_criticality_score != new_criticality_score:
            new_criticality_score = calc_criticality_score
            criticality_changed = True
        
        # Determine criticality level
        max_impact = max(safety_impact, production_impact, environmental_impact, reputation_impact)
        if max_impact >= 5:
            criticality_level = "safety_critical"
        elif max_impact >= 4:
            criticality_level = "production_critical"
        elif max_impact >= 3:
            criticality_level = "medium"
        else:
            criticality_level = "low"
        
        criticality_data = {
            "safety_impact": safety_impact,
            "production_impact": production_impact,
            "environmental_impact": environmental_impact,
            "reputation_impact": reputation_impact,
            "level": criticality_level,
            "criticality_score": new_criticality_score
        }
    
    # If either changed, recalculate risk score
    if fmea_changed or criticality_changed:
        # Calculate new risk score: (Criticality × 0.75) + (Likelihood Score × 0.25)
        new_risk_score = int((new_criticality_score * 0.75) + (fmea_score * 0.25))
        new_risk_score = min(100, max(0, new_risk_score))
        
        # Determine risk level
        if new_risk_score >= 70:
            risk_level = "Critical"
        elif new_risk_score >= 50:
            risk_level = "High"
        elif new_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        # Update the threat in database
        update_data = {
            "risk_score": new_risk_score,
            "fmea_score": fmea_score,
            "criticality_score": new_criticality_score,
            "risk_level": risk_level,
            "equipment_criticality": criticality_level,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if criticality_data:
            update_data["equipment_criticality_data"] = criticality_data
        
        if equipment_node:
            update_data["linked_equipment_id"] = equipment_node["id"]
        
        await db.threats.update_one({"id": threat_id}, {"$set": update_data})
        
        # Return updated values
        threat["risk_score"] = new_risk_score
        threat["fmea_score"] = fmea_score
        threat["criticality_score"] = new_criticality_score
        threat["risk_level"] = risk_level
        threat["equipment_criticality"] = criticality_level
        if criticality_data:
            threat["equipment_criticality_data"] = criticality_data
        if equipment_node:
            threat["linked_equipment_id"] = equipment_node["id"]
        
        logger.info(f"Auto-synced threat {threat_id}: risk={new_risk_score}, crit={new_criticality_score}, fmea={fmea_score}")
    
    # Ensure risk_score is int
    if isinstance(threat.get("risk_score"), float):
        threat["risk_score"] = int(threat["risk_score"])
    
    # Add required fields that may be missing
    if "rank" not in threat:
        threat["rank"] = 1
    if "total_threats" not in threat:
        threat["total_threats"] = 1
    if "recommended_actions" not in threat:
        threat["recommended_actions"] = []
    if "occurrence_count" not in threat:
        threat["occurrence_count"] = 1
    if not threat.get("frequency"):
        threat["frequency"] = "Unknown"
    if not threat.get("likelihood"):
        threat["likelihood"] = "Unknown"
    if not threat.get("detectability"):
        threat["detectability"] = "Unknown"
    if not threat.get("equipment_type"):
        threat["equipment_type"] = "Equipment"
    if not threat.get("impact"):
        threat["impact"] = "Unknown"
    # Ensure created_at is string
    if threat.get("created_at") and not isinstance(threat["created_at"], str):
        threat["created_at"] = threat["created_at"].isoformat() if hasattr(threat["created_at"], 'isoformat') else str(threat["created_at"])
    
    return threat

@router.patch("/threats/{threat_id}", response_model=ThreatResponse)
async def update_threat(
    threat_id: str,
    update: ThreatUpdate,
    current_user: dict = Depends(get_current_user)
):
    threat = await db.threats.find_one({"id": threat_id, "created_by": current_user["id"]})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    # Recalculate risk if relevant fields changed
    risk_fields = ["likelihood", "detectability", "impact", "frequency"]
    if any(f in update_data for f in risk_fields):
        # Get current values and override with updates
        likelihood = update_data.get("likelihood", threat.get("likelihood", "Possible"))
        detectability = update_data.get("detectability", threat.get("detectability", "Moderate"))
        
        # Calculate new risk score
        likelihood_scores = {"Rare": 1, "Unlikely": 2, "Possible": 3, "Likely": 4, "Almost Certain": 5}
        detectability_scores = {"Easy": 1, "Moderate": 2, "Difficult": 3, "Very Difficult": 4, "Almost Impossible": 5}
        
        l_score = likelihood_scores.get(likelihood, 3)
        d_score = detectability_scores.get(detectability, 2)
        risk_score = l_score * d_score * 10  # Scale to 10-250
        
        # Determine risk level
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
        
        # Recalculate ranks if status changed
        if "status" in update_data:
            await update_all_ranks(current_user["id"])
    
    updated = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    # Ensure risk_score is int
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])
    return updated

@router.delete("/threats/{threat_id}")
async def delete_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    result = await db.threats.delete_one({"id": threat_id, "created_by": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    await update_all_ranks(current_user["id"])
    return {"message": "Threat deleted"}


@router.post("/threats/{threat_id}/link-equipment")
async def link_threat_to_equipment(
    threat_id: str,
    equipment_node_id: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """
    Link a threat to an equipment node and apply its criticality to the threat score.
    This updates the threat's asset field and recalculates the risk score.
    """
    # Get the threat
    threat = await db.threats.find_one({"id": threat_id, "created_by": current_user["id"]})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get the equipment node
    node = await db.equipment_nodes.find_one({"id": equipment_node_id, "created_by": current_user["id"]})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Get criticality data from the node
    criticality = node.get("criticality")
    
    # Calculate 4-Dimension Criticality Score using weighted formula
    # Formula: (Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5
    safety_impact = criticality.get("safety_impact", 0) or 0 if criticality else 0
    production_impact = criticality.get("production_impact", 0) or 0 if criticality else 0
    environmental_impact = criticality.get("environmental_impact", 0) or 0 if criticality else 0
    reputation_impact = criticality.get("reputation_impact", 0) or 0 if criticality else 0
    
    criticality_score = (
        (safety_impact * 25) + 
        (production_impact * 20) + 
        (environmental_impact * 15) + 
        (reputation_impact * 10)
    ) / 3.5
    criticality_score = min(100, int(criticality_score))
    
    criticality_level = criticality.get("level", "low") if criticality else "low"
    criticality_data = {
        "safety_impact": safety_impact,
        "production_impact": production_impact,
        "environmental_impact": environmental_impact,
        "reputation_impact": reputation_impact,
        "level": criticality_level,
        "criticality_score": criticality_score
    }
    
    # Get FMEA score (from linked failure mode or stored score)
    fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
    
    # Check if threat has linked failure mode - recalculate FMEA score
    failure_mode_name = threat.get("failure_mode")
    if failure_mode_name and failure_mode_name != "Unknown":
        for fm in FAILURE_MODES_LIBRARY:
            if fm["failure_mode"].lower() == failure_mode_name.lower():
                fmea_score = min(100, int(fm["rpn"] / 10))
                break
    
    # NEW METHODOLOGY: Risk Score = (Criticality × 0.75) + (FMEA × 0.25)
    final_risk_score = int((criticality_score * 0.75) + (fmea_score * 0.25))
    final_risk_score = min(100, max(0, final_risk_score))
    
    # Determine risk level
    if final_risk_score >= 70:
        risk_level = "Critical"
    elif final_risk_score >= 50:
        risk_level = "High"
    elif final_risk_score >= 30:
        risk_level = "Medium"
    else:
        risk_level = "Low"
    
    # Update threat with new asset link and recalculated score
    update_data = {
        "asset": node["name"],
        "linked_equipment_id": equipment_node_id,
        "equipment_criticality": criticality_level,
        "equipment_criticality_data": criticality_data,
        "criticality_score": criticality_score,
        "fmea_score": fmea_score,
        "base_risk_score": fmea_score,
        "risk_score": final_risk_score,
        "risk_level": risk_level,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.threats.update_one({"id": threat_id}, {"$set": update_data})
    
    # Update ranks
    await update_all_ranks(current_user["id"])
    
    updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    
    return {
        "message": f"Threat linked to {node['name']}",
        "threat": updated_threat,
        "score_calculation": {
            "criticality_score": criticality_score,
            "fmea_score": fmea_score,
            "formula": "(Criticality + FMEA) / 2",
            "final_score": final_risk_score,
            "risk_level": risk_level
        }
    }

@router.post("/threats/{threat_id}/link-failure-mode")
async def link_threat_to_failure_mode(
    threat_id: str,
    failure_mode_id: int = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """
    Link a threat to a failure mode from the FMEA library and recalculate the risk score.
    """
    # Get the threat
    threat = await db.threats.find_one({"id": threat_id, "created_by": current_user["id"]})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Find the failure mode in the library
    matched_fm = None
    for fm in FAILURE_MODES_LIBRARY:
        if fm["id"] == failure_mode_id:
            matched_fm = fm
            break
    
    if not matched_fm:
        raise HTTPException(status_code=404, detail="Failure mode not found in library")
    
    # Create failure mode data snapshot
    failure_mode_data = {
        "id": matched_fm["id"],
        "failure_mode": matched_fm["failure_mode"],
        "category": matched_fm["category"],
        "equipment": matched_fm["equipment"],
        "severity": matched_fm["severity"],
        "occurrence": matched_fm["occurrence"],
        "detectability": matched_fm["detectability"],
        "rpn": matched_fm["rpn"],
        "recommended_actions": matched_fm.get("recommended_actions", [])
    }
    
    # Calculate FMEA score from RPN
    fmea_score = min(100, int(matched_fm["rpn"] / 10))
    
    # Get criticality score from threat (or calculate from stored criticality data)
    criticality_score = threat.get("criticality_score", 0)
    criticality_data = threat.get("equipment_criticality_data")
    
    if criticality_data and criticality_score == 0:
        # Recalculate from stored data
        safety_impact = criticality_data.get("safety_impact", 0) or 0
        production_impact = criticality_data.get("production_impact", 0) or 0
        environmental_impact = criticality_data.get("environmental_impact", 0) or 0
        reputation_impact = criticality_data.get("reputation_impact", 0) or 0
        
        criticality_score = (
            (safety_impact * 25) + 
            (production_impact * 20) + 
            (environmental_impact * 15) + 
            (reputation_impact * 10)
        ) / 3.5
        criticality_score = min(100, int(criticality_score))
    
    # NEW METHODOLOGY: Risk Score = (Criticality × 0.75) + (FMEA × 0.25)
    final_risk_score = int((criticality_score * 0.75) + (fmea_score * 0.25))
    final_risk_score = min(100, max(0, final_risk_score))
    
    # Determine risk level
    if final_risk_score >= 70:
        risk_level = "Critical"
    elif final_risk_score >= 50:
        risk_level = "High"
    elif final_risk_score >= 30:
        risk_level = "Medium"
    else:
        risk_level = "Low"
    
    # Update threat with new failure mode link and recalculated score
    update_data = {
        "failure_mode": matched_fm["failure_mode"],
        "failure_mode_id": matched_fm["id"],
        "failure_mode_data": failure_mode_data,
        "fmea_score": fmea_score,
        "criticality_score": criticality_score,
        "base_risk_score": fmea_score,
        "risk_score": final_risk_score,
        "risk_level": risk_level,
        "recommended_actions": matched_fm.get("recommended_actions", threat.get("recommended_actions", [])),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.threats.update_one({"id": threat_id}, {"$set": update_data})
    
    # Update ranks
    await update_all_ranks(current_user["id"])
    
    updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    
    return {
        "message": f"Threat linked to failure mode: {matched_fm['failure_mode']}",
        "threat": updated_threat,
        "score_calculation": {
            "fmea_score": fmea_score,
            "criticality_score": criticality_score,
            "formula": "(Criticality + FMEA) / 2",
            "final_score": final_risk_score,
            "risk_level": risk_level
        }
    }

@router.post("/threats/{threat_id}/investigate")
async def create_investigation_from_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new investigation from an existing threat with auto-generated timeline and causal diagram."""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Check if investigation already exists for this threat
    existing = await db.investigations.find_one({"threat_id": threat_id})
    if existing:
        return {"investigation": existing, "message": "Investigation already exists for this threat"}
    
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(current_user["id"])
    now = datetime.now(timezone.utc).isoformat()
    
    inv_doc = {
        "id": inv_id,
        "case_number": case_number,
        "title": f"Investigation: {threat['title']}",
        "description": f"Investigation initiated from threat report.\n\nAsset: {threat['asset']}\nFailure Mode: {threat['failure_mode']}\nRisk Level: {threat['risk_level']}\nRisk Score: {threat['risk_score']}",
        "asset_id": None,
        "asset_name": threat.get("asset"),
        "location": threat.get("location"),
        "incident_date": threat.get("created_at"),
        "investigation_leader": current_user["name"],
        "team_members": [],
        "threat_id": threat_id,
        "status": InvestigationStatus.DRAFT.value,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now
    }
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)
    
    # ========== AUTO-CREATE TIMELINE EVENTS ==========
    timeline_events = []
    
    # 1. Initial threat report event
    timeline_events.append({
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "timestamp": threat.get("created_at", now),
        "description": f"Threat reported: {threat['title']}",
        "category": "discovery",
        "source": "Threat Report System",
        "confidence": "high",
        "created_at": now
    })
    
    # 2. Asset information event
    if threat.get("asset"):
        timeline_events.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "timestamp": threat.get("created_at", now),
            "description": f"Affected asset identified: {threat['asset']} ({threat.get('equipment_type', 'Unknown type')})",
            "category": "observation",
            "source": "Threat Report",
            "confidence": "high",
            "created_at": now
        })
    
    # 3. Failure mode observation
    if threat.get("failure_mode"):
        timeline_events.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "timestamp": threat.get("created_at", now),
            "description": f"Observed failure mode: {threat['failure_mode']}",
            "category": "observation",
            "source": "Threat Report",
            "confidence": "medium",
            "created_at": now
        })
    
    # 4. Root cause hypothesis (if available)
    if threat.get("cause"):
        timeline_events.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "timestamp": now,
            "description": f"Initial hypothesis: {threat['cause']}",
            "category": "analysis",
            "source": "AI Analysis",
            "confidence": "medium",
            "created_at": now
        })
    
    # Insert all timeline events
    if timeline_events:
        await db.timeline_events.insert_many(timeline_events)
    
    # ========== AUTO-CREATE FAILURE IDENTIFICATION ==========
    failure_doc = None
    matching_fm = None
    if threat.get("failure_mode"):
        # Try to find matching failure mode from library
        failure_mode_text = threat["failure_mode"].lower()
        for fm in FAILURE_MODES_LIBRARY:
            if fm["failure_mode"].lower() in failure_mode_text or failure_mode_text in fm["failure_mode"].lower():
                matching_fm = fm
                break
            # Also check keywords
            for kw in fm.get("keywords", []):
                if kw.lower() in failure_mode_text:
                    matching_fm = fm
                    break
            if matching_fm:
                break
        
        failure_doc = {
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "asset_name": threat.get("asset", "Unknown"),
            "subsystem": None,
            "component": threat.get("equipment_type", "Unknown"),
            "failure_mode": threat.get("failure_mode"),
            "degradation_mechanism": threat.get("cause"),
            "evidence": f"From threat report: {threat.get('title')}",
            "failure_mode_id": matching_fm["id"] if matching_fm else None,
            "created_at": now
        }
        await db.failure_identifications.insert_one(failure_doc)
    
    # ========== AUTO-CREATE DRAFT CAUSAL DIAGRAM ==========
    cause_nodes = []
    
    # Root node (the failure/problem)
    root_cause_id = str(uuid.uuid4())
    cause_nodes.append({
        "id": root_cause_id,
        "investigation_id": inv_id,
        "description": f"Problem: {threat['title']}",
        "category": "problem",
        "parent_id": None,
        "is_root_cause": False,
        "verification_status": "unverified",
        "created_at": now
    })
    
    # Immediate cause node (failure mode)
    immediate_cause_id = str(uuid.uuid4())
    cause_nodes.append({
        "id": immediate_cause_id,
        "investigation_id": inv_id,
        "description": f"Failure Mode: {threat.get('failure_mode', 'Unknown')}",
        "category": "immediate",
        "parent_id": root_cause_id,
        "is_root_cause": False,
        "verification_status": "unverified",
        "created_at": now
    })
    
    # Get potential root causes based on failure mode
    failure_mode_key = None
    failure_mode_text = threat.get("failure_mode", "").lower()
    for key in FAILURE_MODE_CAUSES.keys():
        if key.lower() in failure_mode_text or failure_mode_text in key.lower():
            failure_mode_key = key
            break
    
    potential_causes = FAILURE_MODE_CAUSES.get(failure_mode_key, FAILURE_MODE_CAUSES["default"])
    
    # Add potential root causes as child nodes
    for i, cause in enumerate(potential_causes[:4]):  # Limit to 4 potential causes
        cause_nodes.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "description": f"Potential Cause {i+1}: {cause}",
            "category": "contributing",
            "parent_id": immediate_cause_id,
            "is_root_cause": False,
            "verification_status": "unverified",
            "created_at": now
        })
    
    # If we have a hypothesis from the threat, add it as a likely root cause
    if threat.get("cause"):
        cause_nodes.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "description": f"Hypothesis: {threat['cause']}",
            "category": "root",
            "parent_id": immediate_cause_id,
            "is_root_cause": True,
            "verification_status": "unverified",
            "created_at": now
        })
    
    # Insert all cause nodes
    if cause_nodes:
        await db.cause_nodes.insert_many(cause_nodes)
    
    # ========== AUTO-CREATE RECOMMENDED ACTIONS ==========
    action_items = []
    
    # Get recommended actions from matching failure mode or threat
    recommended_actions = []
    if matching_fm and matching_fm.get("recommended_actions"):
        recommended_actions = matching_fm["recommended_actions"]
    elif threat.get("recommended_actions"):
        recommended_actions = threat["recommended_actions"]
    
    for i, action in enumerate(recommended_actions[:5]):  # Limit to 5 actions
        action_number = f"ACT-{case_number}-{str(i+1).zfill(3)}"
        action_items.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "action_number": action_number,
            "description": action,
            "action_type": "corrective",
            "priority": "medium" if i > 1 else "high",
            "owner": current_user["name"],
            "due_date": None,
            "status": "open",
            "completion_date": None,
            "verification_method": None,
            "created_at": now
        })
    
    if action_items:
        await db.action_items.insert_many(action_items)
    
    return {
        "investigation": inv_doc, 
        "message": "Investigation created from threat with auto-generated timeline and causal diagram",
        "auto_generated": {
            "timeline_events": len(timeline_events),
            "failure_identifications": 1 if failure_doc else 0,
            "cause_nodes": len(cause_nodes),
            "action_items": len(action_items)
        }
    }
