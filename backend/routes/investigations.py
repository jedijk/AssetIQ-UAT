"""
Investigations routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Header, Response
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
from database import db
from auth import get_current_user
from storage import put_object, get_object, MIME_TYPES, APP_NAME
from investigation_models import (
    InvestigationCreate, InvestigationUpdate, InvestigationStatus,
    TimelineEventCreate, TimelineEventUpdate, EventCategory, ConfidenceLevel,
    FailureIdentificationCreate, FailureIdentificationUpdate,
    CauseNodeCreate, CauseNodeUpdate, CauseCategory,
    ActionItemCreate, ActionItemUpdate, ActionPriority, ActionStatus,
    EvidenceCreate
)
logger = logging.getLogger(__name__)

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
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.action_items.update_one({"id": action_id}, {"$set": update_data})
    
    updated = await db.action_items.find_one({"id": action_id}, {"_id": 0})
    return updated


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
        # Upload to object storage
        result = put_object(storage_path, file_data, content_type)
        
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
    """Download a file from storage."""
    # Find file record
    record = await db.evidence_items.find_one({"storage_path": path, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        data, content_type = get_object(path)
        return Response(
            content=data, 
            media_type=record.get("content_type", content_type),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "download")}"'
            }
        )
    except Exception as e:
        logger.error(f"File download failed: {e}")
        raise HTTPException(status_code=500, detail="File download failed")


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



