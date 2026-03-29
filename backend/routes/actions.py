"""
Actions routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
from database import db
from auth import get_current_user
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Actions"])

# Helper function to enrich items with creator info
async def enrich_with_creator_info(items: list) -> list:
    """Add creator name and initials to items based on created_by field"""
    if not items:
        return items
    
    # Collect unique creator IDs
    creator_ids = set(item.get("created_by") for item in items if item.get("created_by"))
    if not creator_ids:
        return items
    
    # Fetch all creators in one query
    creators = await db.users.find(
        {"id": {"$in": list(creator_ids)}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "photo_url": 1, "avatar_path": 1}
    ).to_list(100)
    
    # Create a lookup map
    creator_map = {c["id"]: c for c in creators}
    
    # Enrich items
    for item in items:
        creator_id = item.get("created_by")
        if creator_id and creator_id in creator_map:
            creator = creator_map[creator_id]
            item["creator_name"] = creator.get("name") or creator.get("email", "").split("@")[0]
            # Check both photo_url and avatar_path
            item["creator_photo"] = creator.get("photo_url") or creator.get("avatar_path")
            # Generate initials
            name = item["creator_name"]
            if name:
                parts = name.split()
                item["creator_initials"] = "".join(p[0].upper() for p in parts[:2])
            else:
                item["creator_initials"] = "?"
        else:
            item["creator_name"] = None
            item["creator_photo"] = None
            item["creator_initials"] = "?"
    
    return items

# ============= CENTRALIZED ACTIONS MANAGEMENT =============

class CentralActionCreate(BaseModel):
    """Model for creating a centralized action."""
    title: str
    description: str
    source_type: str  # 'threat' or 'investigation'
    source_id: str
    source_name: str  # threat title or investigation title for reference
    priority: str = "medium"
    assignee: Optional[str] = None
    action_type: Optional[str] = None  # CM, PM, PDM
    discipline: Optional[str] = None
    due_date: Optional[str] = None
    comments: Optional[str] = None


class CentralActionUpdate(BaseModel):
    """Model for updating a centralized action."""
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    action_type: Optional[str] = None  # CM, PM, PDM
    discipline: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    completion_notes: Optional[str] = None
    comments: Optional[str] = None


@router.get("/actions")
async def get_all_actions(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee: Optional[str] = None,
    source_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all centralized actions with optional filters."""
    query = {"created_by": current_user["id"]}
    
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if assignee:
        query["assignee"] = {"$regex": assignee, "$options": "i"}
    if source_type and source_type != "all":
        query["source_type"] = source_type
    
    actions = await db.central_actions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with creator info
    actions = await enrich_with_creator_info(actions)
    
    # Enrich actions with threat data (RPN and risk score)
    enriched_actions = []
    for action in actions:
        enriched_action = dict(action)
        enriched_action["threat_rpn"] = None
        enriched_action["threat_risk_score"] = None
        enriched_action["threat_risk_level"] = None
        
        # If action is linked to a threat, fetch the threat data
        if action.get("source_type") == "threat" and action.get("source_id"):
            try:
                threat = await db.threats.find_one(
                    {"id": action["source_id"]}, 
                    {"_id": 0, "fmea_rpn": 1, "risk_score": 1, "risk_level": 1}
                )
                if threat:
                    enriched_action["threat_rpn"] = threat.get("fmea_rpn")
                    enriched_action["threat_risk_score"] = threat.get("risk_score")
                    enriched_action["threat_risk_level"] = threat.get("risk_level")
            except Exception as e:
                logger.error(f"Error fetching threat data: {e}")
        
        enriched_actions.append(enriched_action)
    
    # Get stats
    total = await db.central_actions.count_documents({"created_by": current_user["id"]})
    open_count = await db.central_actions.count_documents({"created_by": current_user["id"], "status": "open"})
    in_progress_count = await db.central_actions.count_documents({"created_by": current_user["id"], "status": "in_progress"})
    completed_count = await db.central_actions.count_documents({"created_by": current_user["id"], "status": "completed"})
    overdue_count = await db.central_actions.count_documents({
        "created_by": current_user["id"],
        "status": {"$in": ["open", "in_progress"]},
        "due_date": {"$lt": datetime.now(timezone.utc).isoformat(), "$ne": None}
    })
    
    return {
        "actions": enriched_actions,
        "stats": {
            "total": total,
            "open": open_count,
            "in_progress": in_progress_count,
            "completed": completed_count,
            "overdue": overdue_count
        }
    }


@router.get("/actions/overdue")
async def get_overdue_actions(
    current_user: dict = Depends(get_current_user)
):
    """Get all overdue actions for notifications."""
    now = datetime.now(timezone.utc).isoformat()
    
    overdue_actions = await db.central_actions.find({
        "created_by": current_user["id"],
        "status": {"$in": ["open", "in_progress"]},
        "due_date": {"$lt": now, "$ne": None, "$ne": ""}
    }, {"_id": 0}).sort("due_date", 1).to_list(50)
    
    return {
        "overdue_actions": overdue_actions,
        "count": len(overdue_actions)
    }


@router.post("/actions")
async def create_central_action(
    data: CentralActionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new centralized action (promote from threat or investigation)."""
    action_id = str(uuid.uuid4())
    
    # Generate action number
    count = await db.central_actions.count_documents({"created_by": current_user["id"]})
    action_number = f"ACT-{count + 1:04d}"
    
    action_doc = {
        "id": action_id,
        "action_number": action_number,
        "title": data.title,
        "description": data.description,
        "source_type": data.source_type,
        "source_id": data.source_id,
        "source_name": data.source_name,
        "priority": data.priority,
        "assignee": data.assignee,
        "action_type": data.action_type,
        "discipline": data.discipline,
        "due_date": data.due_date,
        "status": "open",
        "comments": data.comments or "",
        "completion_notes": None,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.central_actions.insert_one(action_doc)
    action_doc.pop("_id", None)
    return action_doc


@router.get("/actions/{action_id}")
async def get_central_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific centralized action."""
    action = await db.central_actions.find_one(
        {"id": action_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@router.patch("/actions/{action_id}")
async def update_central_action(
    action_id: str,
    data: CentralActionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a centralized action."""
    action = await db.central_actions.find_one(
        {"id": action_id, "created_by": current_user["id"]}
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.central_actions.update_one(
        {"id": action_id},
        {"$set": update_data}
    )
    
    updated = await db.central_actions.find_one({"id": action_id}, {"_id": 0})
    return updated


@router.delete("/actions/{action_id}")
async def delete_central_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a centralized action."""
    result = await db.central_actions.delete_one(
        {"id": action_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"message": "Action deleted"}



