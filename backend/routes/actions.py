"""
Actions Routes - Centralized action management
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum
import uuid

from .deps import db, get_current_user, logger

router = APIRouter(prefix="/actions", tags=["Actions"])


# ============= ENUMS =============

class ActionPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ActionStatus(str, Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# ============= PYDANTIC MODELS =============

class ActionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    action_type: Optional[str] = "corrective"
    priority: ActionPriority = ActionPriority.MEDIUM
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    threat_id: Optional[str] = None
    investigation_id: Optional[str] = None


class ActionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ActionStatus] = None
    priority: Optional[ActionPriority] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    completion_notes: Optional[str] = None


# ============= ROUTES =============

@router.get("")
async def get_all_actions(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all actions across all investigations and threats."""
    query = {"created_by": current_user["id"]}
    
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    
    # Get actions from both investigations and standalone
    investigation_actions = await db.action_items.find(
        {"created_by": {"$exists": False}},  # Legacy items without created_by
        {"_id": 0}
    ).to_list(500)
    
    # Also get user's standalone actions
    standalone_actions = await db.standalone_actions.find(
        query, {"_id": 0}
    ).to_list(500)
    
    # Get investigation actions for this user
    user_investigations = await db.investigations.find(
        {"created_by": current_user["id"]},
        {"id": 1}
    ).to_list(100)
    inv_ids = [inv["id"] for inv in user_investigations]
    
    inv_actions = await db.action_items.find(
        {"investigation_id": {"$in": inv_ids}},
        {"_id": 0}
    ).to_list(500)
    
    # Combine and add source info
    all_actions = []
    for action in inv_actions:
        action["source"] = "investigation"
        all_actions.append(action)
    
    for action in standalone_actions:
        action["source"] = "standalone"
        all_actions.append(action)
    
    # Sort by created_at descending
    all_actions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"actions": all_actions}


@router.get("/overdue")
async def get_overdue_actions(current_user: dict = Depends(get_current_user)):
    """Get all overdue actions."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get user's investigations
    user_investigations = await db.investigations.find(
        {"created_by": current_user["id"]},
        {"id": 1}
    ).to_list(100)
    inv_ids = [inv["id"] for inv in user_investigations]
    
    # Find overdue actions from investigations
    overdue_query = {
        "investigation_id": {"$in": inv_ids},
        "due_date": {"$lt": today},
        "status": {"$nin": ["completed", "cancelled"]}
    }
    
    overdue_actions = await db.action_items.find(
        overdue_query, {"_id": 0}
    ).sort("due_date", 1).to_list(100)
    
    # Add investigation info
    for action in overdue_actions:
        inv_id = action.get("investigation_id")
        if inv_id:
            inv = await db.investigations.find_one({"id": inv_id}, {"title": 1, "case_number": 1})
            if inv:
                action["investigation_title"] = inv.get("title")
                action["case_number"] = inv.get("case_number")
    
    return {"overdue_actions": overdue_actions, "count": len(overdue_actions)}


@router.post("")
async def create_standalone_action(
    data: ActionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a standalone action (not tied to investigation)."""
    action_doc = {
        "id": str(uuid.uuid4()),
        "title": data.title,
        "description": data.description,
        "action_type": data.action_type,
        "priority": data.priority.value if isinstance(data.priority, ActionPriority) else data.priority,
        "status": ActionStatus.PROPOSED.value,
        "assigned_to": data.assigned_to,
        "due_date": data.due_date,
        "threat_id": data.threat_id,
        "investigation_id": data.investigation_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.standalone_actions.insert_one(action_doc)
    action_doc.pop("_id", None)
    return action_doc


@router.get("/{action_id}")
async def get_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific action."""
    # Try investigation actions first
    action = await db.action_items.find_one({"id": action_id}, {"_id": 0})
    if action:
        # Verify user has access to this investigation
        inv = await db.investigations.find_one(
            {"id": action.get("investigation_id"), "created_by": current_user["id"]}
        )
        if inv:
            action["source"] = "investigation"
            return action
    
    # Try standalone actions
    action = await db.standalone_actions.find_one(
        {"id": action_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if action:
        action["source"] = "standalone"
        return action
    
    raise HTTPException(status_code=404, detail="Action not found")


@router.patch("/{action_id}")
async def update_action(
    action_id: str,
    update: ActionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an action."""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if "status" in update_data and isinstance(update_data["status"], ActionStatus):
        update_data["status"] = update_data["status"].value
    if "priority" in update_data and isinstance(update_data["priority"], ActionPriority):
        update_data["priority"] = update_data["priority"].value
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Try investigation actions first
    action = await db.action_items.find_one({"id": action_id})
    if action:
        inv = await db.investigations.find_one(
            {"id": action.get("investigation_id"), "created_by": current_user["id"]}
        )
        if inv:
            await db.action_items.update_one({"id": action_id}, {"$set": update_data})
            updated = await db.action_items.find_one({"id": action_id}, {"_id": 0})
            return updated
    
    # Try standalone actions
    result = await db.standalone_actions.update_one(
        {"id": action_id, "created_by": current_user["id"]},
        {"$set": update_data}
    )
    if result.matched_count > 0:
        updated = await db.standalone_actions.find_one({"id": action_id}, {"_id": 0})
        return updated
    
    raise HTTPException(status_code=404, detail="Action not found")


@router.delete("/{action_id}")
async def delete_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an action."""
    # Try standalone first
    result = await db.standalone_actions.delete_one(
        {"id": action_id, "created_by": current_user["id"]}
    )
    if result.deleted_count > 0:
        return {"message": "Action deleted"}
    
    # Check investigation actions (user must own the investigation)
    action = await db.action_items.find_one({"id": action_id})
    if action:
        inv = await db.investigations.find_one(
            {"id": action.get("investigation_id"), "created_by": current_user["id"]}
        )
        if inv:
            await db.action_items.delete_one({"id": action_id})
            return {"message": "Action deleted"}
    
    raise HTTPException(status_code=404, detail="Action not found")
