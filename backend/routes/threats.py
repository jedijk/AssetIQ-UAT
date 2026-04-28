"""
Threats routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
from database import db, failure_modes_service, efm_service, installation_filter
from auth import get_current_user
from models.api_models import ThreatResponse, ThreatUpdate
from failure_modes import FAILURE_MODES_LIBRARY
from services.threat_score_service import calculate_rank, update_all_ranks, recalculate_threat_scores_for_asset, recalculate_threat_scores_for_failure_mode, propagate_risk_to_linked_entities
from services.cache_service import cache
from investigation_models import (
    InvestigationCreate, InvestigationUpdate, InvestigationStatus,
    TimelineEventCreate, EventCategory, ConfidenceLevel,
    FailureIdentificationCreate,
    CauseNodeCreate, CauseCategory,
    ActionItemCreate, ActionPriority, ActionStatus
)
logger = logging.getLogger(__name__)

# Pre-build optimized lookup dictionaries for failure modes (O(1) lookup instead of O(n))
FAILURE_MODES_BY_ID = {fm["id"]: fm for fm in FAILURE_MODES_LIBRARY if "id" in fm}
FAILURE_MODES_BY_NAME = {fm["failure_mode"].lower(): fm for fm in FAILURE_MODES_LIBRARY if "failure_mode" in fm}

async def get_failure_mode_by_name_or_id(failure_mode_name: str = None, failure_mode_id: str = None):
    """
    Get failure mode from database first, then fall back to static library.
    Returns failure mode dict or None.
    """
    fm = None
    
    # First check database for user-created failure modes
    if failure_mode_id:
        db_fm = await db.failure_modes.find_one({"id": failure_mode_id})
        if db_fm:
            db_fm.pop("_id", None)
            # Normalize field names for compatibility
            fm = {
                "id": db_fm.get("id"),
                "failure_mode": db_fm.get("name", ""),
                "severity": db_fm.get("severity", 5),
                "occurrence": db_fm.get("occurrence", 5),
                "detectability": db_fm.get("detectability", 5),
                "rpn": db_fm.get("rpn", 125),
                "recommended_actions": db_fm.get("recommended_actions", []),
                "equipment": db_fm.get("equipment_type", ""),
                "mechanism": db_fm.get("mechanism", ""),
                "effect": db_fm.get("effect", ""),
                "cause": db_fm.get("cause", ""),
            }
            return fm
    
    if failure_mode_name:
        db_fm = await db.failure_modes.find_one({"name": {"$regex": f"^{failure_mode_name}$", "$options": "i"}})
        if db_fm:
            db_fm.pop("_id", None)
            fm = {
                "id": db_fm.get("id"),
                "failure_mode": db_fm.get("name", ""),
                "severity": db_fm.get("severity", 5),
                "occurrence": db_fm.get("occurrence", 5),
                "detectability": db_fm.get("detectability", 5),
                "rpn": db_fm.get("rpn", 125),
                "recommended_actions": db_fm.get("recommended_actions", []),
                "equipment": db_fm.get("equipment_type", ""),
                "mechanism": db_fm.get("mechanism", ""),
                "effect": db_fm.get("effect", ""),
                "cause": db_fm.get("cause", ""),
            }
            return fm
    
    # Fall back to static library
    if failure_mode_id and failure_mode_id in FAILURE_MODES_BY_ID:
        return FAILURE_MODES_BY_ID[failure_mode_id]
    if failure_mode_name and failure_mode_name.lower() in FAILURE_MODES_BY_NAME:
        return FAILURE_MODES_BY_NAME[failure_mode_name.lower()]
    
    return None

# Common failure mode causes for investigation root cause analysis
FAILURE_MODE_CAUSES = {
    "wear": ["Normal wear and tear", "Inadequate lubrication", "Abrasive particles", "Improper material selection"],
    "corrosion": ["Chemical exposure", "Moisture ingress", "Galvanic reaction", "Inadequate coating"],
    "fatigue": ["Cyclic loading", "Stress concentration", "Material defect", "Design inadequacy"],
    "overload": ["Excessive force", "Improper operation", "Design limitation", "Control system failure"],
    "contamination": ["Foreign particles", "Fluid degradation", "Seal failure", "Inadequate filtration"],
    "vibration": ["Imbalance", "Misalignment", "Looseness", "Resonance"],
    "leakage": ["Seal degradation", "Gasket failure", "Crack propagation", "Connection loosening"],
    "electrical": ["Insulation breakdown", "Overheating", "Voltage spike", "Connection corrosion"],
    "blockage": ["Debris accumulation", "Scale buildup", "Foreign object", "Product solidification"],
    "default": ["Equipment degradation", "Operational stress", "Environmental factors", "Maintenance gap"]
}

router = APIRouter(tags=["Threats"])


async def generate_case_number(user_id: str) -> str:
    count = await db.investigations.count_documents({"created_by": user_id})
    year = datetime.now(timezone.utc).strftime("%Y")
    return f"INV-{year}-{count + 1:04d}"

# Helper function to enrich items with creator info
async def enrich_with_creator_info(items: list) -> list:
    """Add creator name and initials to items based on created_by field.
    Uses caching to reduce database queries."""
    if not items:
        return items
    
    # Collect unique creator IDs
    creator_ids = list(set(item.get("created_by") for item in items if item.get("created_by")))
    if not creator_ids:
        return items
    
    # Check cache first
    cached_creators = cache.get_users_batch(creator_ids)
    uncached_ids = [uid for uid in creator_ids if uid not in cached_creators]
    
    # Only fetch uncached users from database
    if uncached_ids:
        creators = await db.users.find(
            {"id": {"$in": uncached_ids}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "photo_url": 1, "avatar_path": 1, "avatar_data": 1, "position": 1, "role": 1}
        ).to_list(100)
        
        # Cache the fetched users
        fetched_map = {c["id"]: c for c in creators}
        cache.set_users_batch(fetched_map)
        
        # Merge with cached
        cached_creators.update(fetched_map)
    
    creator_map = cached_creators
    
    # Enrich items
    for item in items:
        creator_id = item.get("created_by")
        if creator_id and creator_id in creator_map:
            creator = creator_map[creator_id]
            item["creator_name"] = creator.get("name") or creator.get("email", "").split("@")[0]
            item["creator_position"] = creator.get("position") or creator.get("role") or "Team Member"
            # Check photo_url, avatar_path, or avatar_data (MongoDB fallback)
            if creator.get("photo_url"):
                item["creator_photo"] = creator.get("photo_url")
            elif creator.get("avatar_path") or creator.get("avatar_data"):
                # Generate API URL for avatar (works for both storage methods)
                item["creator_photo"] = f"/api/users/{creator_id}/avatar"
            else:
                item["creator_photo"] = None
            # Generate initials
            name = item["creator_name"]
            if name:
                parts = name.split()
                item["creator_initials"] = "".join(p[0].upper() for p in parts[:2])
            else:
                item["creator_initials"] = "?"
        else:
            item["creator_name"] = None
            item["creator_position"] = None
            item["creator_photo"] = None
            item["creator_initials"] = "?"
    
    return items


async def enrich_with_equipment_tags(items: list) -> list:
    """Add equipment tag to items based on linked_equipment_id or asset name.
    Uses batch lookup for efficiency."""
    if not items:
        return items
    
    # Collect equipment IDs and asset names for batch lookup
    equipment_ids = list(set(item.get("linked_equipment_id") for item in items if item.get("linked_equipment_id")))
    asset_names = list(set(item.get("asset", "").lower() for item in items if item.get("asset")))
    
    if not equipment_ids and not asset_names:
        return items
    
    # Build query for equipment nodes
    query_conditions = []
    if equipment_ids:
        query_conditions.append({"id": {"$in": equipment_ids}})
    if asset_names:
        # Case-insensitive name matching
        query_conditions.append({"name": {"$regex": f"^({'|'.join(asset_names)})$", "$options": "i"}})
    
    equipment_nodes = await db.equipment_nodes.find(
        {"$or": query_conditions} if query_conditions else {},
        {"_id": 0, "id": 1, "name": 1, "tag": 1}
    ).to_list(500)
    
    # Build lookup maps
    equipment_by_id = {eq["id"]: eq for eq in equipment_nodes}
    equipment_by_name = {eq["name"].lower(): eq for eq in equipment_nodes if eq.get("name")}
    
    # Enrich items with tags
    for item in items:
        tag = None
        # First try by linked_equipment_id
        eq_id = item.get("linked_equipment_id")
        if eq_id and eq_id in equipment_by_id:
            tag = equipment_by_id[eq_id].get("tag")
        # Fallback to asset name lookup
        if not tag:
            asset_name = (item.get("asset") or "").lower()
            if asset_name and asset_name in equipment_by_name:
                tag = equipment_by_name[asset_name].get("tag")
        
        item["equipment_tag"] = tag
    
    return items


@router.get("/threats", response_model=List[ThreatResponse])
async def get_threats(
    status: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    # Get user's installation filter data
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    
    # If no installations assigned, return empty list
    if not installation_ids:
        return []
    
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, current_user["id"]
    )
    equipment_names = await installation_filter.get_equipment_names_for_installations(
        installation_ids, current_user["id"]
    )
    
    # Build filter with installation scope
    additional_filters = {}
    if status:
        additional_filters["status"] = status
    
    query = installation_filter.build_threat_filter(
        current_user["id"], equipment_ids, equipment_names, additional_filters
    )
    
    if query.get("_impossible"):
        return []
    
    threats = await db.threats.find(query, {"_id": 0}).sort("rank", 1).limit(limit).to_list(limit)
    total_count = len(threats)
    
    # Enrich with creator info
    threats = await enrich_with_creator_info(threats)
    
    # Enrich with equipment tags
    threats = await enrich_with_equipment_tags(threats)
    
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
    # Get user's installation filter data
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    
    # If no installations assigned, return empty list
    if not installation_ids:
        return []
    
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, current_user["id"]
    )
    equipment_names = await installation_filter.get_equipment_names_for_installations(
        installation_ids, current_user["id"]
    )
    
    # Build filter with installation scope
    query = installation_filter.build_threat_filter(
        current_user["id"], equipment_ids, equipment_names, {"status": {"$ne": "Closed"}}
    )
    
    if query.get("_impossible"):
        return []
    
    threats = await db.threats.find(query, {"_id": 0}).sort("risk_score", -1).limit(limit).to_list(limit)
    total_count = len(threats)
    
    # Enrich with creator info (name, picture, position)
    threats = await enrich_with_creator_info(threats)
    
    # Enrich with equipment tags
    threats = await enrich_with_equipment_tags(threats)
    
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
        failure_mode_id = threat.get("failure_mode_id")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        
        if failure_mode_name and failure_mode_name != "Unknown":
            # Check database first, then static library
            fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
            if fm:
                # Calculate FMEA score from RPN
                fmea_score = min(100, int(fm["rpn"] / 10))
        
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
    
    # Propagate updated risk scores to linked actions and investigations
    threat_ids = [t["id"] for t in threats]
    actions_updated, inv_updated = await propagate_risk_to_linked_entities(threat_ids)
    
    return {
        "message": f"Successfully recalculated {updated_count} threat scores",
        "updated_count": updated_count,
        "actions_propagated": actions_updated,
        "investigations_propagated": inv_updated
    }

@router.get("/threats/{threat_id}", response_model=ThreatResponse)
async def get_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Remove created_by filter - threats are shared tenant entities
        # Access is controlled by installation assignment, not ownership
        threat = await db.threats.find_one(
            {"id": threat_id},
            {"_id": 0}
        )
        if not threat:
            raise HTTPException(status_code=404, detail="Threat not found")
        
        # Auto-sync criticality from linked equipment if available
        linked_equipment_id = threat.get("linked_equipment_id")
        asset_name = threat.get("asset")
        
        # Try to find linked equipment node (shared entity - no created_by filter)
        equipment_node = None
        try:
            if linked_equipment_id:
                # Check cache first
                equipment_node = cache.get_equipment(linked_equipment_id)
                if not equipment_node:
                    equipment_node = await db.equipment_nodes.find_one(
                        {"id": linked_equipment_id},
                        {"_id": 0}
                    )
                    if equipment_node:
                        cache.set_equipment(linked_equipment_id, equipment_node)
            elif asset_name:
                # Fallback: try to find by asset name (cache by name)
                cache_key = f"name:{asset_name}"
                equipment_node = cache.get_equipment(cache_key)
                if not equipment_node:
                    equipment_node = await db.equipment_nodes.find_one(
                        {"name": asset_name},
                        {"_id": 0}
                    )
                    if equipment_node:
                        cache.set_equipment(cache_key, equipment_node)
        except Exception as e:
            logger.warning(f"Could not fetch equipment node for threat {threat_id}: {e}")
        
        # Auto-sync FMEA score from linked failure mode
        failure_mode_name = threat.get("failure_mode")
        failure_mode_id = threat.get("failure_mode_id")
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        fmea_changed = False
        
        if failure_mode_name and failure_mode_name != "Unknown":
            # Check database first, then static library
            fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
            
            if fm:
                # Calculate current FMEA score from failure mode
                current_fmea = min(100, int((fm["severity"] * fm["occurrence"] * fm["detectability"]) / 10))
                if current_fmea != fmea_score:
                    fmea_score = current_fmea
                    fmea_changed = True
                    logger.info(f"Auto-synced FMEA score for threat {threat_id}: {fmea_score}")
        
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
            
            # Propagate updated risk to linked actions and investigations
            await propagate_risk_to_linked_entities([threat_id], [threat])
        
        # Ensure risk_score is int
        if isinstance(threat.get("risk_score"), float):
            threat["risk_score"] = int(threat["risk_score"])
        
        # Add equipment tag from equipment node
        if equipment_node and equipment_node.get("tag"):
            threat["equipment_tag"] = equipment_node.get("tag")
        
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching threat {threat_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching threat data")

@router.patch("/threats/{threat_id}", response_model=ThreatResponse)
async def update_threat(
    threat_id: str,
    update: ThreatUpdate,
    current_user: dict = Depends(get_current_user)
):
    # Remove created_by filter - threats are shared tenant entities
    threat = await db.threats.find_one({"id": threat_id})
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
        
        # Propagate risk changes to linked actions and investigations
        if any(f in update_data for f in ["risk_score", "risk_level", "fmea_rpn"]):
            updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
            await propagate_risk_to_linked_entities([threat_id], [updated_threat])
        
        # Invalidate stats cache
        cache.invalidate_stats(f"stats:{current_user['id']}")
    
    updated = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    # Ensure risk_score is int
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])
    return updated

@router.delete("/threats/{threat_id}")
async def delete_threat(
    threat_id: str,
    delete_actions: bool = Query(False, description="Also delete linked Central Actions"),
    delete_investigations: bool = Query(False, description="Also delete linked Investigations"),
    current_user: dict = Depends(get_current_user)
):
    """Delete a threat/observation. Optionally delete linked Actions and Investigations."""
    deleted_actions_count = 0
    deleted_investigations_count = 0
    
    # Optionally delete linked Central Actions
    if delete_actions:
        result = await db.central_actions.delete_many({
            "source_type": "threat",
            "source_id": threat_id
        })
        deleted_actions_count = result.deleted_count
        logger.info(f"Deleted {deleted_actions_count} central actions linked to threat {threat_id}")
    
    # Optionally delete linked Investigations
    if delete_investigations:
        # Find all investigations linked to this threat
        linked_investigations = await db.investigations.find({"threat_id": threat_id}).to_list(100)
        
        for inv in linked_investigations:
            inv_id = inv.get("id")
            # Delete investigation's internal data
            await db.timeline_events.delete_many({"investigation_id": inv_id})
            await db.failure_identifications.delete_many({"investigation_id": inv_id})
            await db.cause_nodes.delete_many({"investigation_id": inv_id})
            await db.action_items.delete_many({"investigation_id": inv_id})
            await db.evidence_items.delete_many({"investigation_id": inv_id})
            
            # Also delete Central Actions linked to this investigation if delete_actions is true
            if delete_actions:
                result = await db.central_actions.delete_many({
                    "source_type": "investigation",
                    "source_id": inv_id
                })
                deleted_actions_count += result.deleted_count
        
        # Delete the investigations themselves
        result = await db.investigations.delete_many({"threat_id": threat_id})
        deleted_investigations_count = result.deleted_count
        logger.info(f"Deleted {deleted_investigations_count} investigations linked to threat {threat_id}")
    
    # Owner and admin can delete any threat
    if current_user.get("role") in ["owner", "admin"]:
        result = await db.threats.delete_one({"id": threat_id})
    else:
        # Others can only delete their own
        result = await db.threats.delete_one({"id": threat_id, "created_by": current_user["id"]})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Threat not found or you don't have permission to delete it")
    
    await update_all_ranks(current_user["id"])
    
    # Invalidate stats cache
    cache.invalidate_stats(f"stats:{current_user['id']}")
    
    return {
        "message": "Threat deleted",
        "deleted_actions": deleted_actions_count,
        "deleted_investigations": deleted_investigations_count
    }


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
    # Get the threat (shared entity - no created_by filter)
    threat = await db.threats.find_one({"id": threat_id})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get the equipment node (shared entity - no created_by filter)
    node = await db.equipment_nodes.find_one({"id": equipment_node_id})
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
    failure_mode_id = threat.get("failure_mode_id")
    if failure_mode_name and failure_mode_name != "Unknown":
        fm = await get_failure_mode_by_name_or_id(failure_mode_name, failure_mode_id)
        if fm:
            fmea_score = min(100, int(fm["rpn"] / 10))
    
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
    # Get the threat (shared entity - no created_by filter)
    threat = await db.threats.find_one({"id": threat_id})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Find the failure mode - check database first, then static library
    matched_fm = None
    
    # Check database for user-created failure modes
    db_fm = await db.failure_modes.find_one({"id": str(failure_mode_id)})
    if db_fm:
        db_fm.pop("_id", None)
        matched_fm = {
            "id": db_fm.get("id"),
            "failure_mode": db_fm.get("name", ""),
            "category": db_fm.get("category", ""),
            "equipment": db_fm.get("equipment_type", ""),
            "severity": db_fm.get("severity", 5),
            "occurrence": db_fm.get("occurrence", 5),
            "detectability": db_fm.get("detectability", 5),
            "rpn": db_fm.get("rpn", 125),
            "recommended_actions": db_fm.get("recommended_actions", []),
            "mechanism": db_fm.get("mechanism", ""),
            "effect": db_fm.get("effect", ""),
            "cause": db_fm.get("cause", ""),
        }
    else:
        # Fall back to static library
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
    # Shared entity - no created_by filter for read access
    threat = await db.threats.find_one(
        {"id": threat_id},
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
        # Try to find matching failure mode - check database first, then static library
        failure_mode_text = threat["failure_mode"].lower()
        
        # Check database for user-created failure modes
        db_fm = await db.failure_modes.find_one({
            "$or": [
                {"name": {"$regex": failure_mode_text, "$options": "i"}},
                {"keywords": {"$regex": failure_mode_text, "$options": "i"}}
            ]
        })
        if db_fm:
            db_fm.pop("_id", None)
            matching_fm = {
                "id": db_fm.get("id"),
                "failure_mode": db_fm.get("name", ""),
                "recommended_actions": db_fm.get("recommended_actions", []),
                "severity": db_fm.get("severity", 5),
                "occurrence": db_fm.get("occurrence", 5),
                "detectability": db_fm.get("detectability", 5),
                "rpn": db_fm.get("rpn", 125),
            }
        else:
            # Fall back to static library
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
    
    def _normalize_recommended_action(a: Any):
        # Supports both legacy string actions and structured dict actions from the UI/library.
        if isinstance(a, dict):
            desc = a.get("description") or a.get("action") or ""
            typ = a.get("action_type") or ""
            disc = a.get("discipline") or ""
            return str(desc).strip(), str(typ).strip(), str(disc).strip()
        return str(a).strip(), "", ""

    def _map_action_type(t: str) -> str:
        # Investigation action_items historically used corrective/preventive.
        x = (t or "").strip().upper()
        if x == "CM":
            return "corrective"
        if x == "PM":
            return "preventive"
        if x == "PDM":
            return "predictive"
        return "corrective"

    for i, action in enumerate(recommended_actions[:5]):  # Limit to 5 actions
        action_number = f"ACT-{case_number}-{str(i+1).zfill(3)}"
        desc, action_type_code, discipline = _normalize_recommended_action(action)
        action_items.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "action_number": action_number,
            "description": desc,
            "action_type": _map_action_type(action_type_code),
            "action_type_code": action_type_code or None,
            "discipline": discipline or None,
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



# ============= OBSERVATION TIMELINE ENDPOINT =============

@router.get("/threats/{threat_id}/timeline")
async def get_threat_timeline(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get timeline of all activity related to a specific observation/threat.
    Includes: other observations on same equipment, actions, and tasks.
    """
    # Shared entity - no created_by filter for read access
    threat = await db.threats.find_one(
        {"id": threat_id},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    timeline_items = []
    equipment_id = threat.get("linked_equipment_id")
    asset_name = threat.get("asset", "")
    
    # Get the current observation as the first timeline item
    timeline_items.append({
        "id": threat.get("id"),
        "type": "observation",
        "title": threat.get("title", "Untitled Observation"),
        "description": threat.get("description", ""),
        "failure_mode": threat.get("failure_mode", ""),
        "status": threat.get("status", "open"),
        "risk_level": threat.get("risk_level", "medium"),
        "risk_score": threat.get("risk_score", 0),
        "created_at": threat.get("created_at"),
        "updated_at": threat.get("updated_at"),
        "source": "threat",
        "is_current": True
    })
    
    # Get OTHER observations on the same equipment (past history)
    if equipment_id or asset_name:
        obs_query_conditions = []
        if equipment_id:
            obs_query_conditions.append({"linked_equipment_id": equipment_id})
        if asset_name:
            obs_query_conditions.append({"asset": asset_name})
        
        # Shared entities - no created_by filter
        past_observations = await db.threats.find(
            {
                "id": {"$ne": threat_id},  # Exclude current observation
                "$or": obs_query_conditions
            },
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        
        for obs in past_observations:
            timeline_items.append({
                "id": obs.get("id"),
                "type": "observation",
                "title": obs.get("title", "Untitled Observation"),
                "description": obs.get("description", ""),
                "failure_mode": obs.get("failure_mode", ""),
                "status": obs.get("status", "open"),
                "risk_level": obs.get("risk_level", "medium"),
                "risk_score": obs.get("risk_score", 0),
                "created_at": obs.get("created_at"),
                "updated_at": obs.get("updated_at"),
                "source": "threat",
                "is_current": False
            })
    
    # Get actions created from this observation OR related to the equipment
    # Actions directly linked to this observation (source_id) should show regardless of creator
    # Also include actions from sibling observations (same equipment)
    direct_action_conditions = [
        {"source_id": threat_id},
        {"threat_id": threat_id},
        {"observation_id": threat_id}
    ]
    
    # Collect all sibling observation IDs (observations on same equipment)
    sibling_obs_ids = [obs.get("id") for obs in past_observations if obs.get("id")]
    
    # Add conditions for actions linked to sibling observations
    if sibling_obs_ids:
        direct_action_conditions.append({"source_id": {"$in": sibling_obs_ids}})
        direct_action_conditions.append({"threat_id": {"$in": sibling_obs_ids}})
        direct_action_conditions.append({"observation_id": {"$in": sibling_obs_ids}})
    
    equipment_action_conditions = []
    if equipment_id:
        equipment_action_conditions.append({"linked_equipment_id": equipment_id})
    if asset_name:
        equipment_action_conditions.append({"equipment_name": asset_name})
    
    # Combine: directly linked actions OR sibling observation actions OR equipment-linked actions
    action_query = {"$or": direct_action_conditions + equipment_action_conditions} if equipment_action_conditions else {"$or": direct_action_conditions}
    
    actions = await db.central_actions.find(
        action_query,
        {"_id": 0}
    ).to_list(100)
    
    for action in actions:
        timeline_items.append({
            "id": action.get("id"),
            "type": "action",
            "title": action.get("title", "Untitled Action"),
            "description": action.get("description", ""),
            "status": action.get("status", "open"),
            "priority": action.get("priority", "medium"),
            "due_date": action.get("due_date"),
            "created_at": action.get("created_at"),
            "updated_at": action.get("updated_at"),
            "source": "action"
        })
    
    # Tasks are intentionally NOT included in the observation timeline.
    # Per requirements, the observation timeline shows only Observations, Actions, and Investigations.
    task_instances = []
    
    # Get investigations linked to this observation or sibling observations
    # Filter by: direct threat link, sibling observation link, or same asset
    # Shared entities - no created_by filter
    investigation_conditions = [
        {"threat_id": threat_id}
    ]
    if sibling_obs_ids:
        investigation_conditions.append({"threat_id": {"$in": sibling_obs_ids}})
    if asset_name:
        investigation_conditions.append({"asset_name": asset_name})
    
    investigations = await db.investigations.find(
        {"$or": investigation_conditions},
        {"_id": 0}
    ).to_list(50)
    
    # Deduplicate investigations by id (same investigation may match multiple conditions)
    seen_inv_ids = set()
    for inv in investigations:
        inv_id = inv.get("id")
        if inv_id and inv_id not in seen_inv_ids:
            seen_inv_ids.add(inv_id)
            timeline_items.append({
                "id": inv_id,
                "type": "investigation",
                "title": inv.get("title", "Untitled Investigation"),
                "description": inv.get("description", ""),
                "status": inv.get("status", "draft"),
                "case_number": inv.get("case_number", ""),
                "created_at": inv.get("created_at"),
                "updated_at": inv.get("updated_at"),
                "source": "investigation"
            })
    
    # Sort by date (most recent first)
    # For completed tasks, prefer completed_at so they anchor to actual completion time
    def get_sort_date(item):
        if item.get("type") == "task" and item.get("status") == "completed" and item.get("completed_at"):
            date_str = item.get("completed_at")
        else:
            date_str = item.get("created_at") or item.get("scheduled_date") or ""
        if isinstance(date_str, str):
            try:
                return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return datetime.min.replace(tzinfo=timezone.utc)
        if hasattr(date_str, 'isoformat'):
            return date_str if date_str.tzinfo else date_str.replace(tzinfo=timezone.utc)
        return datetime.min.replace(tzinfo=timezone.utc)
    
    timeline_items.sort(key=get_sort_date, reverse=True)
    
    return {
        "threat_id": threat_id,
        "threat_title": threat.get("title", ""),
        "timeline": timeline_items,
        "total_items": len(timeline_items),
        "counts": {
            "observations": len([i for i in timeline_items if i["type"] == "observation"]),
            "actions": len([i for i in timeline_items if i["type"] == "action"]),
            "tasks": len([i for i in timeline_items if i["type"] == "task"]),
            "investigations": len([i for i in timeline_items if i["type"] == "investigation"])
        }
    }
