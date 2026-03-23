"""
Investigations Routes - Causal Engine / Root Cause Analysis
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum
import uuid
import os
import aiofiles

from .deps import db, get_current_user, logger

router = APIRouter(prefix="/investigations", tags=["Investigations"])


# ============= ENUMS =============

class InvestigationStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    COMPLETE = "complete"
    ARCHIVED = "archived"


class CauseType(str, Enum):
    ROOT = "root"
    CONTRIBUTING = "contributing"
    SYMPTOM = "symptom"


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

class InvestigationCreate(BaseModel):
    title: str
    description: Optional[str] = None
    asset_id: Optional[str] = None
    asset_name: Optional[str] = None
    location: Optional[str] = None
    incident_date: Optional[str] = None
    investigation_leader: Optional[str] = None
    team_members: List[str] = []
    threat_id: Optional[str] = None


class InvestigationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[InvestigationStatus] = None
    investigation_leader: Optional[str] = None
    team_members: Optional[List[str]] = None
    conclusions: Optional[str] = None
    recommendations: Optional[str] = None


class TimelineEventCreate(BaseModel):
    event_time: str
    title: str
    description: Optional[str] = None
    event_type: Optional[str] = "observation"
    comment: Optional[str] = None


class TimelineEventUpdate(BaseModel):
    event_time: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    comment: Optional[str] = None


class FailureCreate(BaseModel):
    failure_mode: str
    functional_failure: Optional[str] = None
    detected_by: Optional[str] = None
    detection_method: Optional[str] = None
    comment: Optional[str] = None


class FailureUpdate(BaseModel):
    failure_mode: Optional[str] = None
    functional_failure: Optional[str] = None
    detected_by: Optional[str] = None
    detection_method: Optional[str] = None
    comment: Optional[str] = None


class CauseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    cause_type: CauseType = CauseType.CONTRIBUTING
    parent_id: Optional[str] = None
    comment: Optional[str] = None


class CauseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cause_type: Optional[CauseType] = None
    parent_id: Optional[str] = None
    comment: Optional[str] = None


class ActionItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    action_type: Optional[str] = "corrective"
    priority: ActionPriority = ActionPriority.MEDIUM
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    cause_id: Optional[str] = None
    comment: Optional[str] = None


class ActionItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ActionStatus] = None
    priority: Optional[ActionPriority] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    completion_notes: Optional[str] = None
    comment: Optional[str] = None


class EvidenceCreate(BaseModel):
    title: str
    evidence_type: str = "document"
    description: Optional[str] = None
    file_url: Optional[str] = None


# ============= HELPER FUNCTIONS =============

async def generate_case_number(user_id: str) -> str:
    """Generate a unique case number."""
    count = await db.investigations.count_documents({"created_by": user_id})
    year = datetime.now().year
    return f"INV-{year}-{count + 1:04d}"


# ============= INVESTIGATION ROUTES =============

@router.post("")
async def create_investigation(
    data: InvestigationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new investigation case."""
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(current_user["id"])
    
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
        "status": InvestigationStatus.DRAFT.value,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)
    return inv_doc


@router.get("")
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
    return {"investigations": investigations}


@router.get("/{inv_id}")
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


@router.patch("/{inv_id}")
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


@router.delete("/{inv_id}")
async def delete_investigation(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an investigation and all related data."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Delete all related data
    await db.timeline_events.delete_many({"investigation_id": inv_id})
    await db.failure_identifications.delete_many({"investigation_id": inv_id})
    await db.cause_nodes.delete_many({"investigation_id": inv_id})
    await db.action_items.delete_many({"investigation_id": inv_id})
    await db.evidence_items.delete_many({"investigation_id": inv_id})
    await db.investigations.delete_one({"id": inv_id})
    
    return {"message": "Investigation deleted"}


# ============= TIMELINE EVENTS =============

@router.post("/{inv_id}/events")
async def add_timeline_event(
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
    
    event_doc = {
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "event_time": data.event_time,
        "title": data.title,
        "description": data.description,
        "event_type": data.event_type,
        "comment": data.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.timeline_events.insert_one(event_doc)
    event_doc.pop("_id", None)
    return event_doc


@router.patch("/{inv_id}/events/{event_id}")
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
    if update_data:
        await db.timeline_events.update_one({"id": event_id}, {"$set": update_data})
    
    updated = await db.timeline_events.find_one({"id": event_id}, {"_id": 0})
    return updated


@router.delete("/{inv_id}/events/{event_id}")
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

@router.post("/{inv_id}/failures")
async def add_failure_identification(
    inv_id: str,
    data: FailureCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a failure identification."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    failure_doc = {
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "failure_mode": data.failure_mode,
        "functional_failure": data.functional_failure,
        "detected_by": data.detected_by,
        "detection_method": data.detection_method,
        "comment": data.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.failure_identifications.insert_one(failure_doc)
    failure_doc.pop("_id", None)
    return failure_doc


@router.patch("/{inv_id}/failures/{failure_id}")
async def update_failure_identification(
    inv_id: str,
    failure_id: str,
    update: FailureUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a failure identification."""
    failure = await db.failure_identifications.find_one({"id": failure_id, "investigation_id": inv_id})
    if not failure:
        raise HTTPException(status_code=404, detail="Failure not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.failure_identifications.update_one({"id": failure_id}, {"$set": update_data})
    
    updated = await db.failure_identifications.find_one({"id": failure_id}, {"_id": 0})
    return updated


@router.delete("/{inv_id}/failures/{failure_id}")
async def delete_failure_identification(
    inv_id: str,
    failure_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a failure identification."""
    result = await db.failure_identifications.delete_one({"id": failure_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Failure not found")
    return {"message": "Failure deleted"}


# ============= CAUSE NODES =============

@router.post("/{inv_id}/causes")
async def add_cause_node(
    inv_id: str,
    data: CauseCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a cause node."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    if data.parent_id:
        parent = await db.cause_nodes.find_one({"id": data.parent_id, "investigation_id": inv_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent cause not found")
    
    cause_doc = {
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "title": data.title,
        "description": data.description,
        "cause_type": data.cause_type.value if isinstance(data.cause_type, CauseType) else data.cause_type,
        "parent_id": data.parent_id,
        "comment": data.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.cause_nodes.insert_one(cause_doc)
    cause_doc.pop("_id", None)
    return cause_doc


@router.patch("/{inv_id}/causes/{cause_id}")
async def update_cause_node(
    inv_id: str,
    cause_id: str,
    update: CauseUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a cause node."""
    cause = await db.cause_nodes.find_one({"id": cause_id, "investigation_id": inv_id})
    if not cause:
        raise HTTPException(status_code=404, detail="Cause not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "cause_type" in update_data and isinstance(update_data["cause_type"], CauseType):
        update_data["cause_type"] = update_data["cause_type"].value
    
    if update_data:
        await db.cause_nodes.update_one({"id": cause_id}, {"$set": update_data})
    
    updated = await db.cause_nodes.find_one({"id": cause_id}, {"_id": 0})
    return updated


@router.delete("/{inv_id}/causes/{cause_id}")
async def delete_cause_node(
    inv_id: str,
    cause_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a cause node and its children."""
    cause = await db.cause_nodes.find_one({"id": cause_id, "investigation_id": inv_id})
    if not cause:
        raise HTTPException(status_code=404, detail="Cause not found")
    
    # Delete children recursively
    async def delete_children(parent_id):
        children = await db.cause_nodes.find({"parent_id": parent_id}).to_list(100)
        for child in children:
            await delete_children(child["id"])
            await db.cause_nodes.delete_one({"id": child["id"]})
    
    await delete_children(cause_id)
    await db.cause_nodes.delete_one({"id": cause_id})
    
    return {"message": "Cause and children deleted"}


# ============= ACTION ITEMS =============

@router.post("/{inv_id}/actions")
async def add_action_item(
    inv_id: str,
    data: ActionItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add an action item."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Generate action number
    count = await db.action_items.count_documents({"investigation_id": inv_id})
    
    action_doc = {
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "action_number": count + 1,
        "title": data.title,
        "description": data.description,
        "action_type": data.action_type,
        "priority": data.priority.value if isinstance(data.priority, ActionPriority) else data.priority,
        "status": ActionStatus.PROPOSED.value,
        "assigned_to": data.assigned_to,
        "due_date": data.due_date,
        "cause_id": data.cause_id,
        "comment": data.comment,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.action_items.insert_one(action_doc)
    action_doc.pop("_id", None)
    return action_doc


@router.patch("/{inv_id}/actions/{action_id}")
async def update_action_item(
    inv_id: str,
    action_id: str,
    update: ActionItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an action item."""
    action = await db.action_items.find_one({"id": action_id, "investigation_id": inv_id})
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "status" in update_data and isinstance(update_data["status"], ActionStatus):
        update_data["status"] = update_data["status"].value
    if "priority" in update_data and isinstance(update_data["priority"], ActionPriority):
        update_data["priority"] = update_data["priority"].value
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.action_items.update_one({"id": action_id}, {"$set": update_data})
    
    updated = await db.action_items.find_one({"id": action_id}, {"_id": 0})
    return updated


@router.delete("/{inv_id}/actions/{action_id}")
async def delete_action_item(
    inv_id: str,
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an action item."""
    result = await db.action_items.delete_one({"id": action_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"message": "Action deleted"}


# ============= EVIDENCE =============

@router.post("/{inv_id}/evidence")
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
    
    evidence_doc = {
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "title": data.title,
        "evidence_type": data.evidence_type,
        "description": data.description,
        "file_url": data.file_url,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.evidence_items.insert_one(evidence_doc)
    evidence_doc.pop("_id", None)
    return evidence_doc


@router.delete("/{inv_id}/evidence/{evidence_id}")
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


@router.post("/{inv_id}/upload")
async def upload_evidence_file(
    inv_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an evidence file."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Create uploads directory
    upload_dir = f"/app/backend/uploads/investigations/{inv_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    stored_filename = f"{file_id}{file_ext}"
    file_path = os.path.join(upload_dir, stored_filename)
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    # Create evidence record
    evidence_doc = {
        "id": file_id,
        "investigation_id": inv_id,
        "title": file.filename or "Uploaded file",
        "evidence_type": "file",
        "description": f"Uploaded file: {file.filename}",
        "file_url": f"/api/files/investigations/{inv_id}/{stored_filename}",
        "original_filename": file.filename,
        "file_size": len(content),
        "mime_type": file.content_type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.evidence_items.insert_one(evidence_doc)
    evidence_doc.pop("_id", None)
    return evidence_doc


# ============= STATISTICS =============

@router.get("/{inv_id}/stats")
async def get_investigation_stats(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get statistics for an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    events_count = await db.timeline_events.count_documents({"investigation_id": inv_id})
    failures_count = await db.failure_identifications.count_documents({"investigation_id": inv_id})
    causes_count = await db.cause_nodes.count_documents({"investigation_id": inv_id})
    
    # Root causes
    root_causes = await db.cause_nodes.count_documents({
        "investigation_id": inv_id,
        "cause_type": "root"
    })
    
    # Actions by status
    actions = await db.action_items.find({"investigation_id": inv_id}).to_list(100)
    action_stats = {"total": len(actions), "by_status": {}, "by_priority": {}}
    
    for action in actions:
        status = action.get("status", "unknown")
        priority = action.get("priority", "unknown")
        action_stats["by_status"][status] = action_stats["by_status"].get(status, 0) + 1
        action_stats["by_priority"][priority] = action_stats["by_priority"].get(priority, 0) + 1
    
    # Evidence count
    evidence_count = await db.evidence_items.count_documents({"investigation_id": inv_id})
    
    # Calculate completion percentage
    total_items = events_count + failures_count + causes_count + len(actions)
    completed_actions = action_stats["by_status"].get("completed", 0)
    
    return {
        "investigation_id": inv_id,
        "status": inv.get("status"),
        "timeline_events": events_count,
        "failure_identifications": failures_count,
        "causes": {
            "total": causes_count,
            "root_causes": root_causes
        },
        "actions": action_stats,
        "evidence": evidence_count,
        "completion": {
            "total_items": total_items,
            "completed_actions": completed_actions,
            "has_root_cause": root_causes > 0,
            "has_actions": len(actions) > 0
        }
    }
