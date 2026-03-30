"""
Actions routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
import uuid
import logging
from database import db, installation_filter
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
        {"_id": 0, "id": 1, "name": 1, "email": 1, "photo_url": 1, "avatar_path": 1, "position": 1, "role": 1}
    ).to_list(100)
    
    # Create a lookup map
    creator_map = {c["id"]: c for c in creators}
    
    # Enrich items
    for item in items:
        creator_id = item.get("created_by")
        if creator_id and creator_id in creator_map:
            creator = creator_map[creator_id]
            item["creator_name"] = creator.get("name") or creator.get("email", "").split("@")[0]
            item["creator_position"] = creator.get("position") or creator.get("role") or "Team Member"
            # Check both photo_url and avatar_path - convert avatar_path to API URL
            if creator.get("photo_url"):
                item["creator_photo"] = creator.get("photo_url")
            elif creator.get("avatar_path"):
                # Generate API URL for avatar
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
    """Get all centralized actions with optional filters, filtered by user's assigned installations."""
    # Get user's installation filter data
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    
    # If no installations assigned, return empty result
    if not installation_ids:
        return {
            "actions": [],
            "stats": {
                "total": 0,
                "open": 0,
                "in_progress": 0,
                "completed": 0,
                "overdue": 0
            }
        }
    
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, current_user["id"]
    )
    equipment_names = await installation_filter.get_equipment_names_for_installations(
        installation_ids, current_user["id"]
    )
    
    # Get threat IDs that belong to user's installations
    threat_ids = await installation_filter.get_filtered_threat_ids(
        current_user["id"], equipment_ids, equipment_names
    )
    
    # Get investigation IDs that belong to user's installations
    investigation_ids = await installation_filter.get_filtered_investigation_ids(
        current_user["id"], equipment_ids, equipment_names
    )
    
    # Build base query with installation filtering
    query = installation_filter.build_action_filter(
        current_user["id"], equipment_ids, equipment_names, threat_ids, investigation_ids
    )
    
    if query.get("_impossible"):
        return {
            "actions": [],
            "stats": {"total": 0, "open": 0, "in_progress": 0, "completed": 0, "overdue": 0}
        }
    
    # Add additional filters
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
    
    # Get stats (also filtered by installation)
    base_stats_query = installation_filter.build_action_filter(
        current_user["id"], equipment_ids, equipment_names, threat_ids
    )
    
    if base_stats_query.get("_impossible"):
        stats = {"total": 0, "open": 0, "in_progress": 0, "completed": 0, "overdue": 0}
    else:
        total = await db.central_actions.count_documents(base_stats_query)
        
        open_query = {**base_stats_query, "status": "open"}
        open_count = await db.central_actions.count_documents(open_query)
        
        in_progress_query = {**base_stats_query, "status": "in_progress"}
        in_progress_count = await db.central_actions.count_documents(in_progress_query)
        
        completed_query = {**base_stats_query, "status": "completed"}
        completed_count = await db.central_actions.count_documents(completed_query)
        
        overdue_query = {
            **base_stats_query,
            "status": {"$in": ["open", "in_progress"]},
            "due_date": {"$lt": datetime.now(timezone.utc).isoformat(), "$ne": None}
        }
        overdue_count = await db.central_actions.count_documents(overdue_query)
        
        stats = {
            "total": total,
            "open": open_count,
            "in_progress": in_progress_count,
            "completed": completed_count,
            "overdue": overdue_count
        }
    
    return {
        "actions": enriched_actions,
        "stats": stats
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
        "due_date": {"$lt": now, "$nin": [None, ""]}
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
    from bson import ObjectId
    
    # Try to find by id field first
    action = await db.central_actions.find_one(
        {"id": action_id},
        {"_id": 0}
    )
    
    # If not found, try by ObjectId
    if not action:
        try:
            action = await db.central_actions.find_one(
                {"_id": ObjectId(action_id)},
                {"_id": 0}
            )
        except:
            pass
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@router.patch("/actions/{action_id}")
async def update_central_action(
    action_id: str,
    data: CentralActionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a centralized action. Owner and Admin can update any action."""
    from bson import ObjectId
    
    # Try to find by id field first
    action = await db.central_actions.find_one({"id": action_id})
    
    # If not found, try by ObjectId
    if not action:
        try:
            action = await db.central_actions.find_one({"_id": ObjectId(action_id)})
        except:
            pass
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Check if status is being changed to completed
    status_changed_to_completed = (
        data.status == "completed" and 
        action.get("status") != "completed"
    )
    
    # Update using _id from the found document
    await db.central_actions.update_one(
        {"_id": action["_id"]},
        {"$set": update_data}
    )
    
    updated = await db.central_actions.find_one({"_id": action["_id"]}, {"_id": 0})
    
    # Check if all actions for the source are now completed
    completion_notification = None
    if status_changed_to_completed and action.get("source_type") and action.get("source_id"):
        source_type = action["source_type"]
        source_id = action["source_id"]
        
        # Count remaining open actions for this source (not filtered by created_by - actions are shared)
        remaining_open = await db.central_actions.count_documents({
            "source_type": source_type,
            "source_id": source_id,
            "status": {"$ne": "completed"}
        })
        
        if remaining_open == 0:
            # All actions completed - prepare notification
            total_actions = await db.central_actions.count_documents({
                "source_type": source_type,
                "source_id": source_id
            })
            
            # Get source details
            source_name = None
            source_status = None
            if source_type == "threat":
                threat = await db.threats.find_one({"id": source_id}, {"_id": 0, "title": 1, "status": 1})
                if threat:
                    source_name = threat.get("title", "Observation")
                    source_status = threat.get("status")
            elif source_type == "investigation":
                inv = await db.investigations.find_one({"id": source_id}, {"_id": 0, "title": 1, "status": 1})
                if inv:
                    source_name = inv.get("title", "Investigation")
                    source_status = inv.get("status")
            
            # Only suggest closure if source is not already closed
            if source_status not in ["closed", "completed"]:
                completion_notification = {
                    "type": "all_actions_completed",
                    "source_type": source_type,
                    "source_id": source_id,
                    "source_name": source_name,
                    "total_actions": total_actions,
                    "message": f"All {total_actions} action(s) for '{source_name}' are now complete! Consider closing this {source_type.replace('threat', 'observation')}.",
                    "suggest_closure": True
                }
    
    response = dict(updated)
    if completion_notification:
        response["completion_notification"] = completion_notification
    
    return response


@router.delete("/actions/{action_id}")
async def delete_central_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a centralized action. Owner and Admin can delete any action."""
    from bson import ObjectId
    
    # Owner and Admin can delete any action
    if current_user.get("role") in ["owner", "admin"]:
        # Try to find by id field first
        action = await db.central_actions.find_one({"id": action_id})
        
        # If not found, try by ObjectId
        if not action:
            try:
                action = await db.central_actions.find_one({"_id": ObjectId(action_id)})
            except:
                pass
        
        if not action:
            raise HTTPException(status_code=404, detail="Action not found")
        
        # Delete using the found document's _id
        result = await db.central_actions.delete_one({"_id": action["_id"]})
    else:
        # Others can only delete their own
        result = await db.central_actions.delete_one(
            {"id": action_id, "created_by": current_user["id"]}
        )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found or you don't have permission to delete it")
    return {"message": "Action deleted"}


# ============= ACTION VALIDATION =============

class ActionValidateRequest(BaseModel):
    """Model for validating an action."""
    validated_by_name: str
    validated_by_position: str
    validated_by_id: Optional[str] = None


@router.post("/actions/{action_id}/validate")
async def validate_action(
    action_id: str,
    data: ActionValidateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Validate an action (mark as reviewed/approved by a person)."""
    from bson import ObjectId
    
    # Try to find by id field first
    action = await db.central_actions.find_one({"id": action_id})
    
    # If not found, try by ObjectId
    if not action:
        try:
            action = await db.central_actions.find_one({"_id": ObjectId(action_id)})
        except:
            pass
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    update_data = {
        "is_validated": True,
        "validated_by_name": data.validated_by_name,
        "validated_by_position": data.validated_by_position,
        "validated_by_id": data.validated_by_id or current_user["id"],
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.central_actions.update_one(
        {"id": action_id},
        {"$set": update_data}
    )
    
    updated = await db.central_actions.find_one({"id": action_id}, {"_id": 0})
    return updated


@router.post("/actions/{action_id}/unvalidate")
async def unvalidate_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove validation from an action."""
    action = await db.central_actions.find_one(
        {"id": action_id, "created_by": current_user["id"]}
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    update_data = {
        "is_validated": False,
        "validated_by_name": None,
        "validated_by_position": None,
        "validated_by_id": None,
        "validated_at": None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.central_actions.update_one(
        {"id": action_id},
        {"$set": update_data}
    )
    
    updated = await db.central_actions.find_one({"id": action_id}, {"_id": 0})
    return updated


# ============= ACTION COMPLETION CHECK =============

@router.get("/actions/source/{source_type}/{source_id}/completion-status")
async def get_source_action_completion_status(
    source_type: str,
    source_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Check if all actions for a given source (threat/investigation) are completed.
    Returns completion status and suggests closure if all actions are done.
    """
    if source_type not in ["threat", "investigation"]:
        raise HTTPException(status_code=400, detail="Invalid source_type. Must be 'threat' or 'investigation'")
    
    # Get all actions for this source
    all_actions = await db.central_actions.find(
        {"source_type": source_type, "source_id": source_id, "created_by": current_user["id"]},
        {"_id": 0, "id": 1, "status": 1, "title": 1, "is_validated": 1}
    ).to_list(100)
    
    if not all_actions:
        return {
            "source_type": source_type,
            "source_id": source_id,
            "total_actions": 0,
            "completed_actions": 0,
            "all_completed": False,
            "all_validated": False,
            "suggest_closure": False,
            "pending_actions": [],
            "message": "No actions found for this source"
        }
    
    completed_actions = [a for a in all_actions if a.get("status") == "completed"]
    validated_actions = [a for a in all_actions if a.get("is_validated")]
    pending_actions = [a for a in all_actions if a.get("status") != "completed"]
    
    total = len(all_actions)
    completed = len(completed_actions)
    validated = len(validated_actions)
    all_completed = completed == total
    all_validated = validated == total
    
    # Suggest closure only if ALL actions are completed
    suggest_closure = all_completed and total > 0
    
    # Get source name for notification
    source_name = None
    if source_type == "threat":
        threat = await db.threats.find_one({"id": source_id}, {"_id": 0, "title": 1, "status": 1})
        if threat:
            source_name = threat.get("title", "Observation")
            # Don't suggest closure if already closed
            if threat.get("status") == "closed":
                suggest_closure = False
    elif source_type == "investigation":
        investigation = await db.investigations.find_one({"id": source_id}, {"_id": 0, "title": 1, "status": 1})
        if investigation:
            source_name = investigation.get("title", "Investigation")
            if investigation.get("status") == "completed":
                suggest_closure = False
    
    return {
        "source_type": source_type,
        "source_id": source_id,
        "source_name": source_name,
        "total_actions": total,
        "completed_actions": completed,
        "validated_actions": validated,
        "completion_percentage": round((completed / total) * 100) if total > 0 else 0,
        "all_completed": all_completed,
        "all_validated": all_validated,
        "suggest_closure": suggest_closure,
        "pending_actions": [{"id": a["id"], "title": a.get("title", "Untitled")} for a in pending_actions],
        "message": f"All {total} action(s) completed! Consider closing this {source_type.replace('threat', 'observation')}." if suggest_closure else None
    }



