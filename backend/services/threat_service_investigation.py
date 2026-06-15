"""Threat investigation bootstrap and observation timeline — split from threat_service."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from failure_modes import FAILURE_MODES_LIBRARY
from investigation_models import InvestigationStatus
from services.tenant_schema import merge_tenant_filter, with_tenant_id

# Heuristic root-cause suggestions when auto-building causal diagrams from threats.
FAILURE_MODE_CAUSES: Dict[str, List[str]] = {
    "default": [
        "Insufficient maintenance",
        "Design deficiency",
        "Operating outside limits",
        "Component wear",
    ],
    "bearing": ["Inadequate lubrication", "Misalignment", "Contamination", "Overloading"],
    "seal": ["Seal face wear", "Improper installation", "Shaft misalignment", "Dry running"],
    "cavitation": ["Insufficient NPSH", "Blocked suction line", "Air entrainment", "Operating off BEP"],
}


async def _find_threat_for_user(user: dict, threat_id: str) -> Optional[dict]:
    return await db.threats.find_one(
        merge_tenant_filter({"id": threat_id}, user),
        {"_id": 0},
    )


async def create_investigation_from_threat(user: dict, threat_id: str):
    """Create a new investigation from an existing threat with auto-generated timeline and causal diagram."""
    from services import investigation_service as inv_svc
    from services.threat_service import assert_threat_installation_scope

    threat = await _find_threat_for_user(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    await assert_threat_installation_scope(user, threat)
    
    # Check if investigation already exists for this threat
    existing = await db.investigations.find_one(
        merge_tenant_filter({"threat_id": threat_id}, user),
        {"_id": 0},
    )
    if existing:
        return {"investigation": existing, "message": "Investigation already exists for this threat"}
    
    inv_id = str(uuid.uuid4())
    case_number = await inv_svc.generate_case_number(user["id"])
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
        "investigation_leader": user["name"],
        "team_members": [],
        "threat_id": threat_id,
        "status": InvestigationStatus.DRAFT.value,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now
    }
    with_tenant_id(inv_doc, user)
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)

    from services.reliability_graph import dispatch_graph_sync

    await dispatch_graph_sync(
        "sync_investigation_edges",
        "threat_investigate",
        investigation_id=inv_id,
        threat_id=threat_id,
        equipment_id=threat.get("linked_equipment_id"),
    )
    
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
        for event in timeline_events:
            with_tenant_id(event, user)
        await db.timeline_events.insert_many(timeline_events)
    
    # ========== AUTO-CREATE FAILURE IDENTIFICATION ==========
    failure_doc = None
    matching_fm = None
    if threat.get("failure_mode"):
        # Try to find matching failure mode - check database first, then static library
        failure_mode_text = threat["failure_mode"].lower()
        from utils.mongo_regex import case_insensitive_contains

        fm_pattern = case_insensitive_contains(failure_mode_text)
        
        # Check database for user-created failure modes
        db_fm = await db.failure_modes.find_one(
            merge_tenant_filter(
                {
                    "$or": [
                        {"name": fm_pattern},
                        {"keywords": fm_pattern},
                    ]
                },
                user,
            )
        ) if fm_pattern else None
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
        with_tenant_id(failure_doc, user)
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
        for node in cause_nodes:
            with_tenant_id(node, user)
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
            "owner": user["name"],
            "due_date": None,
            "status": "open",
            "completion_date": None,
            "verification_method": None,
            "created_at": now
        })
    
    if action_items:
        for item in action_items:
            with_tenant_id(item, user)
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

async def get_threat_timeline(user: dict, threat_id: str):
    """
    Get timeline of all activity related to a specific observation/threat.
    Includes: other observations on same equipment, actions, and tasks.
    """
    threat = await _find_threat_for_user(user, threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    timeline_items = []
    equipment_id = threat.get("linked_equipment_id")
    asset_name = threat.get("asset", "")
    past_observations: List[dict] = []
    
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
            merge_tenant_filter(
                {
                    "id": {"$ne": threat_id},
                    "$or": obs_query_conditions,
                },
                user,
            ),
            {"_id": 0},
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
    action_query = merge_tenant_filter(
        {"$or": direct_action_conditions + equipment_action_conditions}
        if equipment_action_conditions
        else {"$or": direct_action_conditions},
        user,
    )
    
    actions = await db.central_actions.find(
        action_query,
        {"_id": 0},
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
        merge_tenant_filter({"$or": investigation_conditions}, user),
        {"_id": 0},
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
