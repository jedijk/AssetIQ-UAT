"""
Stats routes.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
import logging
import json
from database import db, installation_filter
from auth import get_current_user
from failure_modes import FAILURE_MODES_LIBRARY
from services.cache_service import cache
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Stats"])

@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    # Check cache first
    cache_key = f"stats:{user_id}"
    cached = cache.get_stats(cache_key)
    if cached:
        return cached
    
    # Get user's installation filter data
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    
    # If no installations assigned, return zeros
    if not installation_ids:
        result = {
            "total_threats": 0,
            "open_threats": 0,
            "critical_count": 0,
            "high_count": 0
        }
        cache.set_stats(cache_key, result)
        return result
    
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user_id
    )
    equipment_names = await installation_filter.get_equipment_names_for_installations(
        installation_ids, user_id
    )
    
    # Build base filter
    base_filter = installation_filter.build_threat_filter(
        user_id, equipment_ids, equipment_names
    )
    
    if base_filter.get("_impossible"):
        result = {
            "total_threats": 0,
            "open_threats": 0,
            "critical_count": 0,
            "high_count": 0
        }
        cache.set_stats(cache_key, result)
        return result
    
    total = await db.threats.count_documents(base_filter)
    
    open_filter = {**base_filter, "status": "Open"}
    open_count = await db.threats.count_documents(open_filter)
    
    critical_filter = {**base_filter, "risk_level": "Critical", "status": {"$ne": "Closed"}}
    critical = await db.threats.count_documents(critical_filter)
    
    high_filter = {**base_filter, "risk_level": "High", "status": {"$ne": "Closed"}}
    high = await db.threats.count_documents(high_filter)
    
    result = {
        "total_threats": total,
        "open_threats": open_count,
        "critical_count": critical,
        "high_count": high
    }
    
    # Cache for 1 minute
    cache.set_stats(cache_key, result)
    
    return result

# ============= RELIABILITY PERFORMANCE SCORES =============

@router.get("/reliability-scores")
async def get_reliability_scores(
    node_id: Optional[str] = None,
    level: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate reliability performance scores across 6 dimensions:
    1. Criticality - Equipment hierarchy completeness and criticality assignments
    2. Incidents - Incident records and positive validation
    3. Investigations - Cross-asset analysis coverage
    4. Maintenance - Active maintenance plans and spares
    5. Reactions - Clear reaction plans (resources, support, downtime)
    6. Threats - Unmitigated threat management
    
    Returns scores per equipment and aggregated by hierarchy level.
    """
    user_id = current_user["id"]
    
    # Get all hierarchy nodes with only needed fields
    nodes = await db.equipment_nodes.find(
        {"created_by": user_id}, 
        {"_id": 0, "id": 1, "name": 1, "level": 1, "equipment_type": 1, "criticality": 1, "description": 1, "parent_id": 1}
    ).to_list(1000)
    
    # Get all threats with only needed fields
    threats = await db.threats.find(
        {"created_by": user_id},
        {"_id": 0, "id": 1, "asset_name": 1, "status": 1}
    ).to_list(1000)
    
    # Get all investigations with only needed fields
    investigations = await db.investigations.find(
        {"created_by": user_id},
        {"_id": 0, "id": 1, "threat_id": 1, "asset_name": 1}
    ).to_list(1000)
    
    # Get all actions with only needed fields
    actions = await db.actions.find(
        {"created_by": user_id},
        {"_id": 0, "id": 1, "threat_id": 1, "asset_name": 1, "status": 1}
    ).to_list(1000)
    
    # Get maintenance strategies
    strategies = await db.maintenance_strategies.find({}, {"_id": 0, "equipment_id": 1}).to_list(1000)
    
    # Get equipment types
    equipment_types = await db.equipment_types.find({}, {"_id": 0, "id": 1}).to_list(1000)
    eq_type_ids = {et["id"] for et in equipment_types}
    
    # Calculate scores for each equipment node
    def calculate_node_scores(node):
        node_id = node["id"]
        node_name = node.get("name", "")
        node_level = node.get("level", "")
        equipment_type = node.get("equipment_type")
        criticality = node.get("criticality")
        
        # 1. Criticality Score (0-100)
        # - Has criticality assigned: +50
        # - Has equipment type assigned: +30
        # - Has description: +20
        criticality_score = 0
        if criticality:
            criticality_score += 50
        if equipment_type:
            criticality_score += 30
        if node.get("description"):
            criticality_score += 20
        
        # 2. Incidents Score (0-100)
        # Based on threats recorded for this asset
        node_threats = [t for t in threats if t.get("asset_name", "").lower() == node_name.lower()]
        closed_threats = [t for t in node_threats if t.get("status") == "Closed"]
        
        if len(node_threats) > 0:
            incidents_score = min(100, 50 + (len(closed_threats) / len(node_threats)) * 50)
        else:
            # No incidents could be good (no failures) or bad (no monitoring)
            incidents_score = 60  # Neutral baseline
        
        # 3. Investigations Score (0-100)
        # Cross-asset analysis coverage
        node_investigations = [inv for inv in investigations 
                              if node_name.lower() in (inv.get("description", "") + inv.get("title", "")).lower()]
        completed_investigations = [inv for inv in node_investigations if inv.get("status") == "completed"]
        
        if len(node_investigations) > 0:
            investigations_score = min(100, 40 + (len(completed_investigations) / len(node_investigations)) * 60)
        else:
            investigations_score = 50  # Neutral baseline
        
        # 4. Maintenance Score (0-100)
        # Based on maintenance strategies for the equipment type
        maintenance_score = 0
        if equipment_type and equipment_type in eq_type_ids:
            type_strategies = [s for s in strategies if s.get("equipment_type_id") == equipment_type]
            if len(type_strategies) > 0:
                strategy = type_strategies[0]
                content = strategy.get("strategies_by_criticality", {})
                # Check if strategy has all required components
                if content:
                    maintenance_score = 70  # Has strategy
                    # Bonus for completeness
                    for crit_level, crit_content in content.items():
                        if crit_content.get("operator_rounds"):
                            maintenance_score += 5
                        if crit_content.get("detection_systems"):
                            maintenance_score += 5
                        if crit_content.get("maintenance_tasks"):
                            maintenance_score += 5
                        if crit_content.get("spare_parts"):
                            maintenance_score += 5
                    maintenance_score = min(100, maintenance_score)
            else:
                maintenance_score = 30  # Equipment type exists but no strategy
        else:
            maintenance_score = 20  # No equipment type assigned
        
        # 5. Reactions Score (0-100)
        # Based on action plans and their completion
        node_actions = [a for a in actions if node_name.lower() in (a.get("description", "") + a.get("source", "")).lower()]
        completed_actions = [a for a in node_actions if a.get("status") == "completed"]
        
        if len(node_actions) > 0:
            reactions_score = min(100, 40 + (len(completed_actions) / len(node_actions)) * 60)
        else:
            reactions_score = 50  # Neutral baseline
        
        # 6. Threats Score (0-100)
        # Inverse of unmitigated threats (fewer open threats = higher score)
        open_threats = [t for t in node_threats if t.get("status") == "Open"]
        critical_threats = [t for t in open_threats if t.get("risk_level") in ["Critical", "High"]]
        
        threats_score = 100
        threats_score -= len(open_threats) * 10
        threats_score -= len(critical_threats) * 15  # Extra penalty for critical
        threats_score = max(0, threats_score)
        
        return {
            "node_id": node_id,
            "node_name": node_name,
            "node_level": node_level,
            "parent_id": node.get("parent_id"),
            "equipment_type": equipment_type,
            "criticality": criticality,
            "scores": {
                "criticality": criticality_score,
                "incidents": round(incidents_score),
                "investigations": round(investigations_score),
                "maintenance": round(maintenance_score),
                "reactions": round(reactions_score),
                "threats": round(threats_score),
            },
            "overall_score": round(
                (criticality_score + incidents_score + investigations_score + 
                 maintenance_score + reactions_score + threats_score) / 6
            ),
        }
    
    # Calculate scores for all nodes
    all_scores = [calculate_node_scores(node) for node in nodes]
    
    # Build hierarchy map
    children_map = {}
    for score in all_scores:
        parent_id = score.get("parent_id")
        if parent_id:
            if parent_id not in children_map:
                children_map[parent_id] = []
            children_map[parent_id].append(score)
    
    # Function to aggregate scores up the hierarchy
    def aggregate_children_scores(node_score):
        node_id = node_score["node_id"]
        children = children_map.get(node_id, [])
        
        if not children:
            return node_score
        
        # First, ensure all children are aggregated
        aggregated_children = [aggregate_children_scores(child) for child in children]
        
        # Calculate aggregated score including self and children
        all_entities = [node_score] + aggregated_children
        
        aggregated = {
            "criticality": sum(e["scores"]["criticality"] for e in all_entities) / len(all_entities),
            "incidents": sum(e["scores"]["incidents"] for e in all_entities) / len(all_entities),
            "investigations": sum(e["scores"]["investigations"] for e in all_entities) / len(all_entities),
            "maintenance": sum(e["scores"]["maintenance"] for e in all_entities) / len(all_entities),
            "reactions": sum(e["scores"]["reactions"] for e in all_entities) / len(all_entities),
            "threats": sum(e["scores"]["threats"] for e in all_entities) / len(all_entities),
        }
        
        node_score["aggregated_scores"] = {k: round(v) for k, v in aggregated.items()}
        node_score["aggregated_overall"] = round(sum(aggregated.values()) / 6)
        node_score["child_count"] = len(aggregated_children)
        
        return node_score
    
    # Find root nodes and aggregate
    root_nodes = [s for s in all_scores if not s.get("parent_id")]
    for root in root_nodes:
        aggregate_children_scores(root)
    
    # Calculate global aggregated scores
    if all_scores:
        global_scores = {
            "criticality": sum(s["scores"]["criticality"] for s in all_scores) / len(all_scores),
            "incidents": sum(s["scores"]["incidents"] for s in all_scores) / len(all_scores),
            "investigations": sum(s["scores"]["investigations"] for s in all_scores) / len(all_scores),
            "maintenance": sum(s["scores"]["maintenance"] for s in all_scores) / len(all_scores),
            "reactions": sum(s["scores"]["reactions"] for s in all_scores) / len(all_scores),
            "threats": sum(s["scores"]["threats"] for s in all_scores) / len(all_scores),
        }
        global_scores = {k: round(v) for k, v in global_scores.items()}
        global_overall = round(sum(global_scores.values()) / 6)
    else:
        global_scores = {
            "criticality": 0, "incidents": 0, "investigations": 0,
            "maintenance": 0, "reactions": 0, "threats": 0
        }
        global_overall = 0
    
    # Filter by node_id if specified
    if node_id:
        matching = [s for s in all_scores if s["node_id"] == node_id]
        if matching:
            return {
                "node": matching[0],
                "global_scores": global_scores,
                "global_overall": global_overall,
            }
        else:
            raise HTTPException(status_code=404, detail="Node not found")
    
    # Group by level if specified
    if level:
        level_nodes = [s for s in all_scores if s["node_level"] == level]
        level_avg = {}
        if level_nodes:
            level_avg = {
                "criticality": round(sum(n["scores"]["criticality"] for n in level_nodes) / len(level_nodes)),
                "incidents": round(sum(n["scores"]["incidents"] for n in level_nodes) / len(level_nodes)),
                "investigations": round(sum(n["scores"]["investigations"] for n in level_nodes) / len(level_nodes)),
                "maintenance": round(sum(n["scores"]["maintenance"] for n in level_nodes) / len(level_nodes)),
                "reactions": round(sum(n["scores"]["reactions"] for n in level_nodes) / len(level_nodes)),
                "threats": round(sum(n["scores"]["threats"] for n in level_nodes) / len(level_nodes)),
            }
        return {
            "level": level,
            "nodes": level_nodes,
            "level_average_scores": level_avg,
            "level_count": len(level_nodes),
            "global_scores": global_scores,
            "global_overall": global_overall,
        }
    
    # Return all data
    return {
        "nodes": all_scores,
        "global_scores": global_scores,
        "global_overall": global_overall,
        "total_equipment": len(nodes),
        "summary": {
            "with_criticality": len([n for n in nodes if n.get("criticality")]),
            "with_equipment_type": len([n for n in nodes if n.get("equipment_type")]),
            "total_threats": len(threats),
            "open_threats": len([t for t in threats if t.get("status") == "Open"]),
            "total_investigations": len(investigations),
            "total_actions": len(actions),
        }
    }

# ============= ROOT ENDPOINT =============

@router.get("/")
async def root():
    return {"message": "ThreatBase API", "version": "3.0.0"}

