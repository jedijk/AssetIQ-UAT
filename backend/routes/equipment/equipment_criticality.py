"""
Equipment Criticality and Discipline Assignment.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import logging
from database import db, installation_filter
from auth import get_current_user
from services.threat_score_service import recalculate_threat_scores_for_asset
from services.cache_service import cache
from iso14224_models import ISOLevel, ISO_LEVEL_ORDER, Discipline, CriticalityAssignment

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/equipment-hierarchy/nodes/{node_id}/criticality")
async def assign_criticality(
    node_id: str,
    assignment: CriticalityAssignment,
    current_user: dict = Depends(get_current_user)
):
    """Assign criticality to an equipment node using 4-dimension model."""
    node = await db.equipment_nodes.find_one({"id": node_id})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Check if all 4 dimensions are None/0 - if so, clear criticality
    has_any_dimension = (
        (assignment.safety_impact and assignment.safety_impact > 0) or
        (assignment.production_impact and assignment.production_impact > 0) or
        (assignment.environmental_impact and assignment.environmental_impact > 0) or
        (assignment.reputation_impact and assignment.reputation_impact > 0)
    )
    
    if not has_any_dimension:
        await db.equipment_nodes.update_one(
            {"id": node_id},
            {"$set": {
                "criticality": None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
        return updated
    
    safety = assignment.safety_impact or 0
    production = assignment.production_impact or 0
    environmental = assignment.environmental_impact or 0
    reputation = assignment.reputation_impact or 0
    
    max_impact = max(safety, production, environmental, reputation)
    
    # Determine level based on max dimension
    if safety >= 4 or max_impact == 5:
        level = "safety_critical"
        color = "#EF4444"
    elif production >= 4 or max_impact >= 4:
        level = "production_critical"
        color = "#F97316"
    elif max_impact >= 3:
        level = "medium"
        color = "#EAB308"
    else:
        level = "low"
        color = "#22C55E"
    
    criticality_data = {
        "safety_impact": safety,
        "production_impact": production,
        "environmental_impact": environmental,
        "reputation_impact": reputation,
        "level": level,
        "color": color,
        "max_impact": max_impact,
        "profile_id": assignment.profile_id,
        "fatality_risk": assignment.fatality_risk or 0,
        "production_loss_per_day": assignment.production_loss_per_day or 0,
        "failure_probability": assignment.failure_probability or 0,
        "downtime_days": assignment.downtime_days or 0,
    }
    
    # Calculate risk score
    risk_score = (
        (safety * 25) +
        (production * 20) +
        (environmental * 15) +
        (reputation * 10)
    )
    criticality_data["risk_score"] = round(risk_score, 2)
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "criticality": criticality_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate equipment cache so threat auto-sync reads fresh data
    cache.invalidate_equipment(node_id)
    cache.invalidate_equipment(f"name:{node.get('name')}")
    
    # Recalculate risk scores for all threats linked to this asset
    asset_name = node.get("name")
    updated_threats = 0
    if asset_name:
        updated_threats = await recalculate_threat_scores_for_asset(
            asset_name, 
            current_user["id"], 
            criticality_data,
            node_id
        )
        logger.info(f"Updated {updated_threats} threat scores after criticality change for {asset_name}")
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    updated["threats_updated"] = updated_threats if asset_name else 0
    return updated


@router.post("/equipment-hierarchy/nodes/{node_id}/discipline")
async def assign_discipline(
    node_id: str,
    discipline: str,
    current_user: dict = Depends(get_current_user)
):
    """Assign discipline to an equipment node."""
    node = await db.equipment_nodes.find_one({"id": node_id})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    try:
        Discipline(discipline)
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid discipline. Valid options: {[d.value for d in Discipline]}"
        )
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "discipline": discipline,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated


@router.get("/equipment-hierarchy/stats")
async def get_hierarchy_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get statistics about the equipment hierarchy."""
    user_id = current_user["id"]
    
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    
    if not installation_ids:
        level_counts = {level.value: 0 for level in ISO_LEVEL_ORDER}
        return {
            "total_nodes": 0,
            "by_level": level_counts,
            "by_criticality": {
                "safety_critical": 0,
                "production_critical": 0,
                "medium": 0,
                "low": 0,
                "unassigned": 0
            }
        }
    
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user_id
    )
    
    if not equipment_ids:
        level_counts = {level.value: 0 for level in ISO_LEVEL_ORDER}
        return {
            "total_nodes": 0,
            "by_level": level_counts,
            "by_criticality": {
                "safety_critical": 0,
                "production_critical": 0,
                "medium": 0,
                "low": 0,
                "unassigned": 0
            }
        }
    
    base_query = {"id": {"$in": list(equipment_ids)}}
    
    total_nodes = await db.equipment_nodes.count_documents(base_query)
    
    level_counts = {}
    for level in ISO_LEVEL_ORDER:
        count = await db.equipment_nodes.count_documents(
            {**base_query, "level": level.value}
        )
        level_counts[level.value] = count
    
    criticality_counts = {
        "safety_critical": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "safety_critical"}
        ),
        "production_critical": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "production_critical"}
        ),
        "medium": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "medium"}
        ),
        "low": await db.equipment_nodes.count_documents(
            {**base_query, "criticality.level": "low"}
        ),
        "unassigned": await db.equipment_nodes.count_documents(
            {**base_query, "criticality": None}
        )
    }
    
    return {
        "total_nodes": total_nodes,
        "by_level": level_counts,
        "by_criticality": criticality_counts
    }
