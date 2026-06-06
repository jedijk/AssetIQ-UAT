"""
Investigations routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Header, Response, BackgroundTasks
from datetime import datetime, timezone
import uuid
import json
import os
import logging
from database import db
from auth import get_current_user
from services.storage_service import put_object_async, get_object_async, MIME_TYPES, APP_NAME
from investigation_models import (
    InvestigationCreate, InvestigationUpdate, InvestigationStatus,
    TimelineEventCreate, TimelineEventUpdate, EventCategory, ConfidenceLevel,
    FailureIdentificationCreate, FailureIdentificationUpdate,
    CauseNodeCreate, CauseNodeUpdate, CauseCategory,
    ActionItemCreate, ActionItemUpdate, ActionPriority, ActionStatus,
    EvidenceCreate, RecurringQuadrantData
)
from utils.auto_translate import translate_investigation
from utils.mongo_regex import exact_case_insensitive
from services.ai_gateway import chat as ai_gateway_chat, user_context

logger = logging.getLogger(__name__)

# Defensive Reasoning Check System Prompt - Enhanced for better detection
DEFENSIVE_REASONING_CHECK_PROMPT = """You are an expert in Root Cause Analysis (RCA) and reliability engineering. Your role is to help engineers write better problem statements by identifying and removing DEFENSIVE REASONING patterns that block effective investigation.

## WHAT IS DEFENSIVE REASONING?

Defensive reasoning occurs when people unconsciously protect their assumptions, avoid accountability, or jump to conclusions. It prevents finding the true root cause because it closes off inquiry rather than opening it.

## PATTERNS TO DETECT AND FLAG

### 1. BLAME & ATTRIBUTION (High Priority)
Look for language that assigns fault to people, departments, or external parties:
- "The operator failed to..." → DEFENSIVE: Blames individual
- "Maintenance didn't..." → DEFENSIVE: Blames department  
- "The vendor supplied bad parts" → DEFENSIVE: Blames external party
- "They should have known..." → DEFENSIVE: Implies incompetence
- "Human error caused..." → DEFENSIVE: Oversimplifies to blame
- "Due to lack of training..." → DEFENSIVE: Pre-assigns cause
- "Because [person] didn't follow procedure" → DEFENSIVE: Blame

### 2. ASSUMPTION PROTECTION
Look for unstated assumptions presented as facts:
- "Obviously the seal failed because..." → DEFENSIVE: Assumes cause
- "It's clear that..." → DEFENSIVE: Blocks inquiry
- "Everyone knows that..." → DEFENSIVE: Protects assumption
- "The only explanation is..." → DEFENSIVE: Closes alternatives
- "This always happens when..." → DEFENSIVE: Generalizes

### 3. PREMATURE SOLUTIONS (Solution Reasoning)
Look for fix-focused language instead of problem description:
- "We need to replace..." → SOLUTION: Jumps to fix
- "Should be upgraded to..." → SOLUTION: Prescribes action
- "Must implement..." → SOLUTION: Action-focused
- "The fix is to..." → SOLUTION: Skips understanding
- "Recommend installing..." → SOLUTION: Solution before problem
- "Going forward we will..." → SOLUTION: Future action

### 4. MINIMIZATION & RATIONALIZATION
Look for downplaying or excusing:
- "It's not that bad because..." → DEFENSIVE: Minimizes
- "This was unavoidable..." → DEFENSIVE: Rationalizes
- "Given the circumstances..." → DEFENSIVE: Excuses
- "Under the conditions..." → DEFENSIVE: Justifies
- "It was just a..." → DEFENSIVE: Downplays

### 5. VAGUE OR EVASIVE LANGUAGE
Look for lack of specificity that hides the real issue:
- "Something went wrong with..." → VAGUE: What exactly?
- "There was an issue..." → VAGUE: What issue?
- "Problems occurred..." → VAGUE: What problems?
- "Equipment malfunctioned" → VAGUE: How specifically?

## WHAT MAKES A GOOD PROBLEM STATEMENT

A good problem statement:
1. States OBSERVABLE FACTS only (what was seen, heard, measured)
2. Is SPECIFIC about what, where, when
3. Is NEUTRAL - no blame, no emotion, no judgment
4. Focuses on the DEVIATION from expected/normal
5. Does NOT include causes, solutions, or assumptions
6. Creates CURIOSITY and opens inquiry

## EXAMPLES

BAD: "The operator failed to check oil level causing the bearing to fail"
- Issues: Blames operator, assumes cause, presents conclusion as fact
GOOD: "Bearing seized at 14:30. Oil level was found to be below minimum mark. Last documented oil check was 7 days prior."

BAD: "Pump failed due to cavitation from poor system design"
- Issues: Assumes cause (cavitation), blames design, presents conclusion
GOOD: "Pump P-101 stopped operating at 09:15 with unusual noise reported. Discharge pressure dropped from 85 to 0 PSI over 30 seconds."

BAD: "We need to replace the seals more frequently to prevent this leak"
- Issues: Solution-focused, assumes seal is the issue, prescribes fix
GOOD: "Mechanical seal on pump P-201 leaking approximately 2 drops/second. Seal installed 6 months ago. Rated life is 12 months."

## YOUR TASK

Analyze the problem statement and:
1. Identify ALL instances of defensive reasoning with specific quotes
2. Explain WHY each is problematic (what inquiry does it block?)
3. Provide a REWRITTEN version that is neutral, factual, and opens inquiry
4. Give GUIDANCE on what questions the investigator should be asking

## OUTPUT FORMAT (JSON)

{
  "analysis": {
    "defensive_reasoning": [
      {
        "quote": "exact text from original",
        "pattern": "BLAME|ASSUMPTION|SOLUTION|MINIMIZATION|VAGUE",
        "why_problematic": "explanation of why this blocks good investigation",
        "suggestion": "how to rephrase or what to ask instead"
      }
    ],
    "overall_score": "RED|YELLOW|GREEN",
    "score_explanation": "brief explanation of overall quality"
  },
  "has_issues": true,
  "refined_description": "The improved problem statement - factual, neutral, specific, opens inquiry",
  "guidance": [
    "Questions the investigator should be asking based on this problem",
    "What additional facts should be gathered",
    "What assumptions need to be verified"
  ],
  "changes_made": ["List of specific changes made to improve the statement"]
}

SCORING:
- RED: Contains blame, assumes cause, or prescribes solution - needs significant revision
- YELLOW: Some vague language or minor assumptions - could be improved
- GREEN: Factual, neutral, specific, opens inquiry - good problem statement

Be thorough but constructive. The goal is to help the investigator, not criticize them."""


async def check_for_similar_incidents(user_id: str, asset_name: str, description: str, exclude_id: str = None) -> dict:
    """Check for similar past incidents based on equipment and description keywords."""
    if not asset_name:
        return {"found": False, "similar_incidents": []}
    
    # Find past investigations with same equipment
    query = {
        "created_by": user_id,
        "asset_name": exact_case_insensitive(asset_name),
        "status": {"$in": ["completed", "closed"]}
    }
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    
    past_investigations = await db.investigations.find(
        query,
        {"_id": 0, "id": 1, "title": 1, "description": 1, "incident_date": 1, "case_number": 1}
    ).sort("incident_date", -1).to_list(10)
    
    if not past_investigations:
        return {"found": False, "similar_incidents": []}
    
    # Simple keyword matching for similarity (can be enhanced with AI later)
    description_lower = (description or "").lower()
    similar = []
    
    # Extract keywords from current description
    keywords = set(description_lower.split())
    stop_words = {"the", "a", "an", "is", "was", "were", "are", "been", "be", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "under", "again", "further", "then", "once", "and", "but", "or", "nor", "so", "yet", "both", "either", "neither", "not", "only", "same", "than", "too", "very", "just", "also"}
    keywords = keywords - stop_words
    
    for inv in past_investigations:
        past_desc_lower = (inv.get("description") or "").lower()
        past_title_lower = (inv.get("title") or "").lower()
        past_words = set(past_desc_lower.split()) | set(past_title_lower.split())
        past_words = past_words - stop_words
        
        # Calculate overlap
        if keywords and past_words:
            overlap = len(keywords & past_words)
            if overlap >= 2:  # At least 2 matching keywords
                similar.append({
                    "id": inv["id"],
                    "case_number": inv.get("case_number"),
                    "title": inv.get("title"),
                    "incident_date": inv.get("incident_date"),
                    "match_score": overlap
                })
    
    # Sort by match score
    similar.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    
    return {
        "found": len(similar) > 0,
        "similar_incidents": similar[:5]  # Return top 5
    }

router = APIRouter(tags=["Investigations"])


async def generate_case_number(user_id: str) -> str:
    count = await db.investigations.count_documents({"created_by": user_id})
    year = datetime.now(timezone.utc).strftime("%Y")
    return f"INV-{year}-{count + 1:04d}"


async def generate_action_number(investigation_id: str) -> str:
    count = await db.action_items.count_documents({"investigation_id": investigation_id})
    return f"ACT-{count + 1:03d}"

@router.post("/investigations")
async def create_investigation(
    data: InvestigationCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Create a new investigation case."""
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(current_user["id"])
    
    # Check for similar past incidents to auto-detect recurring issues
    similar_check = await check_for_similar_incidents(
        current_user["id"], 
        data.asset_name, 
        data.description
    )
    
    # Auto-detect recurring if similar incidents found and not explicitly set
    is_recurring = data.is_recurring
    linked_incident_id = data.linked_incident_id
    
    if similar_check["found"] and not is_recurring and not linked_incident_id:
        # Suggest the most similar incident as potential link
        is_recurring = True
        if similar_check["similar_incidents"]:
            linked_incident_id = similar_check["similar_incidents"][0]["id"]
    
    inv_doc = {
        "id": inv_id,
        "case_number": case_number,
        "title": data.title,
        "description": data.description,
        "asset_id": data.asset_id,
        "asset_name": data.asset_name,
        "location": data.location,
        "incident_date": data.incident_date,
        "investigation_leader": data.investigation_leader or current_user["name"],
        "team_members": data.team_members,
        "threat_id": data.threat_id,
        "is_recurring": is_recurring,
        "linked_incident_id": linked_incident_id,
        "recurring_quadrant": None,
        "status": InvestigationStatus.DRAFT.value,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)
    
    # Auto-translate investigation title and description
    background_tasks.add_task(
        translate_investigation,
        inv_id,
        {"title": data.title, "description": data.description or ""},
        current_user["id"]
    )
    
    # Include similar incidents info in response
    inv_doc["similar_incidents"] = similar_check.get("similar_incidents", [])
    
    return inv_doc


@router.get("/investigations")
async def get_investigations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all investigations for the current user."""
    query = {"created_by": current_user["id"]}
    if status:
        query["status"] = status
    
    investigations = await db.investigations.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Fetch lead user pictures and positions
    for inv in investigations:
        lead_picture = None
        lead_name = inv.get("investigation_leader")
        lead_position = "Investigation Lead"
        
        # First try to find user by leader name (from user selection dropdown)
        if inv.get("investigation_leader"):
            user = await db.users.find_one(
                {"name": inv["investigation_leader"]},
                {"_id": 0, "id": 1, "photo_url": 1, "avatar_path": 1, "avatar_data": 1, "name": 1, "position": 1, "role": 1}
            )
            if user:
                if user.get("photo_url"):
                    lead_picture = user.get("photo_url")
                elif user.get("avatar_path") or user.get("avatar_data"):
                    lead_picture = f"/api/users/{user['id']}/avatar"
                lead_name = user.get("name", lead_name)
                lead_position = user.get("position") or user.get("role") or "Investigation Lead"
        
        # Fallback to created_by user if no lead found
        if not lead_picture and inv.get("created_by"):
            user = await db.users.find_one(
                {"id": inv["created_by"]},
                {"_id": 0, "photo_url": 1, "avatar_path": 1, "avatar_data": 1, "name": 1, "position": 1, "role": 1}
            )
            if user:
                if user.get("photo_url"):
                    lead_picture = user.get("photo_url")
                elif user.get("avatar_path") or user.get("avatar_data"):
                    lead_picture = f"/api/users/{inv['created_by']}/avatar"
                if not lead_name:
                    lead_name = user.get("name")
                if lead_position == "Investigation Lead":
                    lead_position = user.get("position") or user.get("role") or "Investigation Lead"
        
        inv["lead_picture"] = lead_picture
        inv["lead_name"] = lead_name
        inv["lead_position"] = lead_position
        
        # Add equipment tag if asset_name is present
        if inv.get("asset_name"):
            equipment = await db.equipment_nodes.find_one(
                {"name": exact_case_insensitive(inv["asset_name"])},
                {"_id": 0, "tag": 1}
            )
            inv["equipment_tag"] = equipment.get("tag") if equipment else None
    
    return {"investigations": investigations}


@router.get("/investigations/{inv_id}")
async def get_investigation(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific investigation with all related data."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Add equipment tag if asset_name is present
    if inv.get("asset_name"):
        equipment = await db.equipment_nodes.find_one(
            {"name": exact_case_insensitive(inv["asset_name"])},
            {"_id": 0, "tag": 1}
        )
        inv["equipment_tag"] = equipment.get("tag") if equipment else None
    
    # Get related data
    events = await db.timeline_events.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).sort("event_time", 1).to_list(500)
    
    failures = await db.failure_identifications.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).to_list(100)
    
    causes = await db.cause_nodes.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).to_list(500)
    
    actions = await db.action_items.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    evidence = await db.evidence_items.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).to_list(100)
    
    return {
        "investigation": inv,
        "timeline_events": events,
        "failure_identifications": failures,
        "cause_nodes": causes,
        "action_items": actions,
        "evidence": evidence
    }


@router.patch("/investigations/{inv_id}")
async def update_investigation(
    inv_id: str,
    update: InvestigationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "status" in update_data and isinstance(update_data["status"], InvestigationStatus):
        update_data["status"] = update_data["status"].value
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.investigations.update_one({"id": inv_id}, {"$set": update_data})
    
    updated = await db.investigations.find_one({"id": inv_id}, {"_id": 0})
    return updated


@router.delete("/investigations/{inv_id}")
async def delete_investigation(
    inv_id: str,
    delete_central_actions: bool = Query(False, description="Also delete linked Central Actions"),
    current_user: dict = Depends(get_current_user)
):
    """Delete an investigation and all related data. Optionally delete linked Central Actions."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    deleted_actions_count = 0
    
    # Optionally delete linked Central Actions
    if delete_central_actions:
        result = await db.central_actions.delete_many({
            "source_type": "investigation",
            "source_id": inv_id
        })
        deleted_actions_count = result.deleted_count
        logger.info(f"Deleted {deleted_actions_count} central actions linked to investigation {inv_id}")
    
    # Delete all related internal data (action_items are investigation-specific, not Central Actions)
    await db.timeline_events.delete_many({"investigation_id": inv_id})
    await db.failure_identifications.delete_many({"investigation_id": inv_id})
    await db.cause_nodes.delete_many({"investigation_id": inv_id})
    await db.action_items.delete_many({"investigation_id": inv_id})
    await db.evidence_items.delete_many({"investigation_id": inv_id})
    await db.investigations.delete_one({"id": inv_id})
    
    return {
        "message": "Investigation deleted",
        "deleted_central_actions": deleted_actions_count
    }


# ============= TIMELINE EVENTS =============

@router.post("/investigations/{inv_id}/events")
async def create_timeline_event(
    inv_id: str,
    data: TimelineEventCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a timeline event to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    event_id = str(uuid.uuid4())
    event_doc = {
        "id": event_id,
        "investigation_id": inv_id,
        "event_time": data.event_time,
        "description": data.description,
        "category": data.category.value,
        "evidence_source": data.evidence_source,
        "confidence": data.confidence.value,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.timeline_events.insert_one(event_doc)
    event_doc.pop("_id", None)
    return event_doc


@router.patch("/investigations/{inv_id}/events/{event_id}")
async def update_timeline_event(
    inv_id: str,
    event_id: str,
    update: TimelineEventUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a timeline event."""
    event = await db.timeline_events.find_one({"id": event_id, "investigation_id": inv_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "category" in update_data and isinstance(update_data["category"], EventCategory):
        update_data["category"] = update_data["category"].value
    if "confidence" in update_data and isinstance(update_data["confidence"], ConfidenceLevel):
        update_data["confidence"] = update_data["confidence"].value
    
    if update_data:
        await db.timeline_events.update_one({"id": event_id}, {"$set": update_data})
    
    updated = await db.timeline_events.find_one({"id": event_id}, {"_id": 0})
    return updated


@router.delete("/investigations/{inv_id}/events/{event_id}")
async def delete_timeline_event(
    inv_id: str,
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a timeline event."""
    result = await db.timeline_events.delete_one({"id": event_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}


# ============= FAILURE IDENTIFICATIONS =============

@router.post("/investigations/{inv_id}/failures")
async def create_failure_identification(
    inv_id: str,
    data: FailureIdentificationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a failure identification to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    failure_id = str(uuid.uuid4())
    failure_doc = {
        "id": failure_id,
        "investigation_id": inv_id,
        "asset_name": data.asset_name or "",
        "subsystem": data.subsystem or "",
        "component": data.component or "",
        "failure_mode": data.failure_mode or "",
        "degradation_mechanism": data.degradation_mechanism or "",
        "evidence": data.evidence or "",
        "failure_mode_id": data.failure_mode_id,
        "comment": data.comment or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.failure_identifications.insert_one(failure_doc)
    failure_doc.pop("_id", None)
    return failure_doc


@router.patch("/investigations/{inv_id}/failures/{failure_id}")
async def update_failure_identification(
    inv_id: str,
    failure_id: str,
    update: FailureIdentificationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a failure identification."""
    failure = await db.failure_identifications.find_one({"id": failure_id, "investigation_id": inv_id})
    if not failure:
        raise HTTPException(status_code=404, detail="Failure identification not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.failure_identifications.update_one({"id": failure_id}, {"$set": update_data})
    
    updated = await db.failure_identifications.find_one({"id": failure_id}, {"_id": 0})
    return updated


@router.delete("/investigations/{inv_id}/failures/{failure_id}")
async def delete_failure_identification(
    inv_id: str,
    failure_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a failure identification."""
    result = await db.failure_identifications.delete_one({"id": failure_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Failure identification not found")
    return {"message": "Failure identification deleted"}


# ============= CAUSE NODES (CAUSAL TREE) =============

@router.post("/investigations/{inv_id}/causes")
async def create_cause_node(
    inv_id: str,
    data: CauseNodeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a cause node to the causal tree."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Validate parent exists if specified
    if data.parent_id:
        parent = await db.cause_nodes.find_one({"id": data.parent_id, "investigation_id": inv_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent cause node not found")
    
    cause_id = str(uuid.uuid4())
    cause_doc = {
        "id": cause_id,
        "investigation_id": inv_id,
        "description": data.description,
        "category": data.category.value,
        "parent_id": data.parent_id,
        "is_root_cause": data.is_root_cause,
        "evidence": data.evidence,
        "linked_event_id": data.linked_event_id,
        "linked_failure_id": data.linked_failure_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.cause_nodes.insert_one(cause_doc)
    cause_doc.pop("_id", None)
    return cause_doc


@router.patch("/investigations/{inv_id}/causes/{cause_id}")
async def update_cause_node(
    inv_id: str,
    cause_id: str,
    update: CauseNodeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a cause node."""
    cause = await db.cause_nodes.find_one({"id": cause_id, "investigation_id": inv_id})
    if not cause:
        raise HTTPException(status_code=404, detail="Cause node not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "category" in update_data and isinstance(update_data["category"], CauseCategory):
        update_data["category"] = update_data["category"].value
    
    if update_data:
        await db.cause_nodes.update_one({"id": cause_id}, {"$set": update_data})
    
    updated = await db.cause_nodes.find_one({"id": cause_id}, {"_id": 0})
    return updated


@router.delete("/investigations/{inv_id}/causes/{cause_id}")
async def delete_cause_node(
    inv_id: str,
    cause_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a cause node and its children."""
    # Get all children recursively
    async def get_children_ids(parent_id):
        children = await db.cause_nodes.find(
            {"parent_id": parent_id, "investigation_id": inv_id},
            {"_id": 0, "id": 1}
        ).to_list(100)
        all_ids = [c["id"] for c in children]
        for child in children:
            all_ids.extend(await get_children_ids(child["id"]))
        return all_ids
    
    children_ids = await get_children_ids(cause_id)
    all_ids = [cause_id] + children_ids
    
    result = await db.cause_nodes.delete_many({"id": {"$in": all_ids}})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cause node not found")
    
    return {"message": f"Deleted {result.deleted_count} cause nodes"}


# ============= ACTION ITEMS =============

@router.post("/investigations/{inv_id}/actions")
async def create_action_item(
    inv_id: str,
    data: ActionItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add an action item to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    action_id = str(uuid.uuid4())
    action_number = await generate_action_number(inv_id)
    
    action_doc = {
        "id": action_id,
        "investigation_id": inv_id,
        "action_number": action_number,
        "description": data.description,
        "owner": data.owner or "",
        "priority": data.priority.value if hasattr(data.priority, 'value') else data.priority,
        "due_date": data.due_date or "",
        "status": ActionStatus.OPEN.value,
        "linked_cause_id": data.linked_cause_id,
        "action_type": data.action_type or "",
        "discipline": data.discipline or "",
        "comment": data.comment or "",
        "completion_notes": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.action_items.insert_one(action_doc)
    action_doc.pop("_id", None)
    return action_doc


@router.patch("/investigations/{inv_id}/actions/{action_id}")
async def update_action_item(
    inv_id: str,
    action_id: str,
    update: ActionItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an action item."""
    action = await db.action_items.find_one({"id": action_id, "investigation_id": inv_id})
    if not action:
        raise HTTPException(status_code=404, detail="Action item not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "priority" in update_data and isinstance(update_data["priority"], ActionPriority):
        update_data["priority"] = update_data["priority"].value
    if "status" in update_data and isinstance(update_data["status"], ActionStatus):
        update_data["status"] = update_data["status"].value
    
    # Check if status is being changed to completed
    status_changed_to_completed = (
        update_data.get("status") == "completed" and 
        action.get("status") != "completed"
    )
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.action_items.update_one({"id": action_id}, {"$set": update_data})
    
    updated = await db.action_items.find_one({"id": action_id}, {"_id": 0})
    
    # Check if all actions for this investigation are now completed
    completion_notification = None
    if status_changed_to_completed:
        # Count remaining open actions for this investigation
        remaining_open = await db.action_items.count_documents({
            "investigation_id": inv_id,
            "status": {"$ne": "completed"}
        })
        
        if remaining_open == 0:
            # All actions completed - prepare notification
            total_actions = await db.action_items.count_documents({
                "investigation_id": inv_id
            })
            
            # Get investigation details
            inv = await db.investigations.find_one({"id": inv_id}, {"_id": 0, "title": 1, "status": 1})
            inv_name = inv.get("title", "Investigation") if inv else "Investigation"
            inv_status = inv.get("status") if inv else None
            
            # Only suggest closure if investigation is not already completed/closed
            if inv_status not in ["completed", "closed"]:
                completion_notification = {
                    "type": "all_actions_completed",
                    "source_type": "investigation",
                    "source_id": inv_id,
                    "source_name": inv_name,
                    "total_actions": total_actions,
                    "message": f"All {total_actions} action(s) for '{inv_name}' are now complete! Consider closing this investigation.",
                    "suggest_closure": True
                }
    
    response = dict(updated)
    if completion_notification:
        response["completion_notification"] = completion_notification
    
    return response


@router.delete("/investigations/{inv_id}/actions/{action_id}")
async def delete_action_item(
    inv_id: str,
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an action item."""
    result = await db.action_items.delete_one({"id": action_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action item not found")
    return {"message": "Action item deleted"}


# ============= EVIDENCE =============

@router.post("/investigations/{inv_id}/evidence")
async def add_evidence(
    inv_id: str,
    data: EvidenceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add evidence to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    evidence_id = str(uuid.uuid4())
    evidence_doc = {
        "id": evidence_id,
        "investigation_id": inv_id,
        "name": data.name,
        "evidence_type": data.evidence_type,
        "description": data.description,
        "file_url": data.file_url,
        "linked_event_id": data.linked_event_id,
        "linked_cause_id": data.linked_cause_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.evidence_items.insert_one(evidence_doc)
    evidence_doc.pop("_id", None)
    return evidence_doc


@router.delete("/investigations/{inv_id}/evidence/{evidence_id}")
async def delete_evidence(
    inv_id: str,
    evidence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete evidence."""
    result = await db.evidence_items.delete_one({"id": evidence_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {"message": "Evidence deleted"}


@router.post("/investigations/{inv_id}/upload")
async def upload_investigation_file(
    inv_id: str,
    file: UploadFile = File(...),
    description: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload a file to an investigation."""
    # Verify investigation exists
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Get file extension and content type
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    
    # Determine evidence type based on file extension
    image_exts = ["jpg", "jpeg", "png", "gif", "webp"]
    doc_exts = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"]
    if ext in image_exts:
        evidence_type = "photo"
    elif ext in doc_exts:
        evidence_type = "document"
    else:
        evidence_type = "file"
    
    # Read file data
    file_data = await file.read()
    file_size = len(file_data)
    
    # Check file size (max 10MB)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Generate storage path
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/investigations/{inv_id}/{file_id}.{ext}"
    
    try:
        # Upload to MongoDB storage
        result = await put_object_async(storage_path, file_data, content_type)
        
        # Create evidence record
        evidence_doc = {
            "id": file_id,
            "investigation_id": inv_id,
            "name": file.filename,
            "evidence_type": evidence_type,
            "description": description,
            "storage_path": result["path"],
            "content_type": content_type,
            "file_size": file_size,
            "original_filename": file.filename,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.evidence_items.insert_one(evidence_doc)
        evidence_doc.pop("_id", None)
        
        return evidence_doc
        
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.get("/files/{path:path}")
async def download_file(
    path: str,
    authorization: str = Header(None),
    auth: str = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Download a file from MongoDB storage."""
    # Find file record
    record = await db.evidence_items.find_one({"storage_path": path, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        data, content_type = await get_object_async(path)
        return Response(
            content=data, 
            media_type=record.get("content_type", content_type),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "download")}"'
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found in storage")
    except Exception as e:
        logger.error(f"File download failed: {e}")
        raise HTTPException(status_code=500, detail="File download failed")




# ============= AI PROBLEM CHECK =============

class AIProblemCheckRequest(BaseModel):
    description: str = Field(..., description="The problem description to analyze")


class AIProblemCheckResponse(BaseModel):
    analysis: Dict[str, Any]
    has_issues: bool
    refined_description: str
    changes_made: List[str]


@router.post("/investigations/{inv_id}/ai-problem-check")
async def ai_problem_check(
    inv_id: str,
    request: AIProblemCheckRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze investigation description using AI for:
    - Defensive reasoning (blaming, rationalizing)
    - Solution reasoning (jumping to fixes)
    - Problem clarity (factual, neutral, focused)
    
    Returns a refined description and analysis.
    """
    # Verify investigation exists and user has access
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    description = request.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Description cannot be empty")
    
    try:
        uid, cid = user_context(current_user)
        content = await ai_gateway_chat(
            [
                {"role": "system", "content": DEFENSIVE_REASONING_CHECK_PROMPT},
                {"role": "user", "content": f"Analyze this problem statement for defensive reasoning:\n\n{description}"},
            ],
            user_id=uid,
            company_id=cid,
            endpoint="investigations.ai_problem_check",
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=2000,
        )
        content = content.strip()
        
        # Clean up JSON if wrapped in markdown code block
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip().rstrip("```")
        
        result = json.loads(content)
        
        return {
            "analysis": result.get("analysis", {}),
            "has_issues": result.get("has_issues", False),
            "refined_description": result.get("refined_description", description),
            "guidance": result.get("guidance", []),
            "changes_made": result.get("changes_made", [])
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"AI problem check failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


# ============= RECURRING ISSUE MANAGEMENT =============

@router.get("/investigations/{inv_id}/similar-incidents")
async def get_similar_incidents(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Find similar past incidents for a given investigation.
    Used to help identify recurring issues.
    """
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    similar = await check_for_similar_incidents(
        current_user["id"],
        inv.get("asset_name"),
        inv.get("description"),
        exclude_id=inv_id
    )
    
    return similar


@router.get("/investigations/{inv_id}/linked-incident")
async def get_linked_incident(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the details of the linked previous incident for recurring analysis.
    """
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    linked_id = inv.get("linked_incident_id")
    if not linked_id:
        return {"linked_incident": None}
    
    linked_inv = await db.investigations.find_one(
        {"id": linked_id, "created_by": current_user["id"]},
        {"_id": 0, "id": 1, "case_number": 1, "title": 1, "description": 1, 
         "asset_name": 1, "incident_date": 1, "status": 1, "recurring_quadrant": 1}
    )
    
    return {"linked_incident": linked_inv}


@router.patch("/investigations/{inv_id}/recurring-quadrant")
async def update_recurring_quadrant(
    inv_id: str,
    quadrant_data: RecurringQuadrantData,
    current_user: dict = Depends(get_current_user)
):
    """
    Update the IS/IS NOT quadrant data for recurring issue analysis.
    """
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Check if investigation is locked
    if inv.get("status") in ["completed", "closed"]:
        raise HTTPException(status_code=400, detail="Cannot modify completed/closed investigation")
    
    update_data = {
        "recurring_quadrant": quadrant_data.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.update_one(
        {"id": inv_id},
        {"$set": update_data}
    )
    
    return {"message": "Quadrant data updated", "recurring_quadrant": quadrant_data.model_dump()}


@router.patch("/investigations/{inv_id}/link-incident")
async def link_incident(
    inv_id: str,
    linked_incident_id: str = Query(..., description="ID of the previous incident to link"),
    current_user: dict = Depends(get_current_user)
):
    """
    Link an investigation to a previous similar incident for recurring analysis.
    """
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Verify linked incident exists
    linked_inv = await db.investigations.find_one(
        {"id": linked_incident_id, "created_by": current_user["id"]}
    )
    if not linked_inv:
        raise HTTPException(status_code=404, detail="Linked incident not found")
    
    # Prevent self-linking
    if inv_id == linked_incident_id:
        raise HTTPException(status_code=400, detail="Cannot link investigation to itself")
    
    update_data = {
        "linked_incident_id": linked_incident_id,
        "is_recurring": True,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.update_one(
        {"id": inv_id},
        {"$set": update_data}
    )
    
    return {
        "message": "Incident linked successfully",
        "linked_incident_id": linked_incident_id,
        "is_recurring": True
    }


@router.delete("/investigations/{inv_id}/link-incident")
async def unlink_incident(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Remove the link to a previous incident.
    """
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    update_data = {
        "linked_incident_id": None,
        "is_recurring": False,
        "recurring_quadrant": None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.update_one(
        {"id": inv_id},
        {"$set": update_data}
    )
    
    return {"message": "Incident unlinked successfully"}
