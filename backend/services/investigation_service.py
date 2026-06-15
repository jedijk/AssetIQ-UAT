"""
Investigation service — Wave 5/6/7 convergence.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from database import db
from investigation_models import (
    ActionPriority,
    ActionStatus,
    CauseCategory,
    ConfidenceLevel,
    EventCategory,
    InvestigationStatus,
    RecurringQuadrantData,
)
from repositories.equipment_repository import EquipmentRepository
from repositories.investigation_repository import InvestigationRepository, delete_investigation_cascade
from repositories.user_repository import UserRepository
from services.ai_gateway import chat as ai_gateway_chat, user_context
from services.investigation_action_bridge import (
    delete_central_for_action_item,
    upsert_central_from_action_item,
)
from services.storage_service import APP_NAME, MIME_TYPES, get_object_async, put_object_async
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from utils.mongo_regex import exact_case_insensitive

logger = logging.getLogger(__name__)

_inv_repo = InvestigationRepository(db)
_user_repo = UserRepository(db)
_equipment_repo = EquipmentRepository(db)


def investigation_query(user: dict, *, inv_id: Optional[str] = None, extra: Optional[dict] = None) -> dict:
    q: Dict[str, Any] = {"created_by": user["id"]}
    if inv_id:
        q["id"] = inv_id
    if extra:
        q.update(extra)
    return merge_tenant_filter(q, user)


async def _lead_enrichment(inv: dict) -> None:
    lead_picture = None
    lead_name = inv.get("investigation_leader")
    lead_position = "Investigation Lead"

    if inv.get("investigation_leader"):
        user = await _user_repo.find_one(
            {"name": inv["investigation_leader"]},
            projection={
                "_id": 0,
                "id": 1,
                "photo_url": 1,
                "avatar_path": 1,
                "avatar_data": 1,
                "name": 1,
                "position": 1,
                "role": 1,
            },
        )
        if user:
            if user.get("photo_url"):
                lead_picture = user.get("photo_url")
            elif user.get("avatar_path") or user.get("avatar_data"):
                lead_picture = f"/api/users/{user['id']}/avatar"
            lead_name = user.get("name", lead_name)
            lead_position = user.get("position") or user.get("role") or "Investigation Lead"

    if not lead_picture and inv.get("created_by"):
        user = await _user_repo.find_one(
            {"id": inv["created_by"]},
            projection={
                "_id": 0,
                "photo_url": 1,
                "avatar_path": 1,
                "avatar_data": 1,
                "name": 1,
                "position": 1,
                "role": 1,
            },
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


async def _equipment_tag_for_asset(asset_name: Optional[str]) -> Optional[str]:
    if not asset_name:
        return None
    equipment = await _equipment_repo.find_one(
        {"name": exact_case_insensitive(asset_name)},
        projection={"_id": 0, "tag": 1},
    )
    return equipment.get("tag") if equipment else None


async def list_investigations(
    user: dict,
    *,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    base: Dict[str, Any] = {"created_by": user["id"]}
    if status:
        base["status"] = status

    investigations = await _inv_repo.find_many(
        base,
        user=user,
        projection={"_id": 0},
        sort=[("created_at", -1)],
        limit=100,
    )

    for inv in investigations:
        await _lead_enrichment(inv)
        if inv.get("asset_name"):
            inv["equipment_tag"] = await _equipment_tag_for_asset(inv["asset_name"])

    return {"investigations": investigations}


async def get_investigation_detail(user: dict, inv_id: str) -> Dict[str, Any]:
    inv = await _inv_repo.find_one(
        investigation_query(user, inv_id=inv_id),
        user=user,
        projection={"_id": 0},
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if inv.get("asset_name"):
        inv["equipment_tag"] = await _equipment_tag_for_asset(inv["asset_name"])

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
        "evidence": evidence,
    }


async def check_for_similar_incidents(
    user_id: str,
    asset_name: str,
    description: str,
    exclude_id: Optional[str] = None,
) -> dict:
    if not asset_name:
        return {"found": False, "similar_incidents": []}

    query: Dict[str, Any] = {
        "created_by": user_id,
        "asset_name": exact_case_insensitive(asset_name),
        "status": {"$in": ["completed", "closed"]},
    }
    if exclude_id:
        query["id"] = {"$ne": exclude_id}

    past_investigations = await _inv_repo.find_many(
        query,
        projection={"_id": 0, "id": 1, "title": 1, "description": 1, "incident_date": 1, "case_number": 1},
        sort=[("incident_date", -1)],
        limit=10,
    )
    if not past_investigations:
        return {"found": False, "similar_incidents": []}

    description_lower = (description or "").lower()
    stop_words = {
        "the", "a", "an", "is", "was", "were", "are", "been", "be", "have", "has", "had",
        "do", "does", "did", "will", "would", "could", "should", "may", "might", "must",
        "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on",
        "with", "at", "by", "from", "as", "into", "through", "during", "before", "after",
        "above", "below", "between", "under", "again", "further", "then", "once", "and",
        "but", "or", "nor", "so", "yet", "both", "either", "neither", "not", "only",
        "same", "than", "too", "very", "just", "also",
    }
    keywords = set(description_lower.split()) - stop_words
    similar = []
    for inv in past_investigations:
        past_words = set((inv.get("description") or "").lower().split()) | set(
            (inv.get("title") or "").lower().split()
        )
        past_words -= stop_words
        if keywords and past_words:
            overlap = len(keywords & past_words)
            if overlap >= 2:
                similar.append({
                    "id": inv["id"],
                    "case_number": inv.get("case_number"),
                    "title": inv.get("title"),
                    "incident_date": inv.get("incident_date"),
                    "match_score": overlap,
                })
    similar.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    return {"found": len(similar) > 0, "similar_incidents": similar[:5]}


async def generate_case_number(user_id: str) -> str:
    count = await _inv_repo.count({"created_by": user_id})
    year = datetime.now(timezone.utc).strftime("%Y")
    return f"INV-{year}-{count + 1:04d}"


async def generate_action_number(investigation_id: str) -> str:
    count = await db.action_items.count_documents({"investigation_id": investigation_id})
    return f"ACT-{count + 1:03d}"


async def create_investigation(user: dict, data: dict) -> dict:
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(user["id"])

    similar_check = await check_for_similar_incidents(
        user["id"], data.get("asset_name", ""), data.get("description", "")
    )
    is_recurring = data.get("is_recurring")
    linked_incident_id = data.get("linked_incident_id")
    if similar_check["found"] and not is_recurring and not linked_incident_id:
        is_recurring = True
        if similar_check["similar_incidents"]:
            linked_incident_id = similar_check["similar_incidents"][0]["id"]

    inv_doc = with_tenant_id({
        "id": inv_id,
        "case_number": case_number,
        "title": data["title"],
        "description": data["description"],
        "asset_id": data.get("asset_id"),
        "asset_name": data.get("asset_name"),
        "location": data.get("location"),
        "incident_date": data.get("incident_date"),
        "investigation_leader": data.get("investigation_leader") or user.get("name"),
        "team_members": data.get("team_members"),
        "threat_id": data.get("threat_id"),
        "is_recurring": is_recurring,
        "linked_incident_id": linked_incident_id,
        "recurring_quadrant": None,
        "status": InvestigationStatus.DRAFT.value,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, user)

    await _inv_repo.insert_document(inv_doc, user=user)
    inv_doc.pop("_id", None)

    if data.get("threat_id"):
        from services.reliability_graph import dispatch_graph_sync

        await dispatch_graph_sync(
            "sync_investigation_edges",
            "investigation_create",
            investigation_id=inv_id,
            threat_id=data["threat_id"],
            equipment_id=data.get("asset_id"),
            tenant_id=inv_doc.get("tenant_id"),
        )

    inv_doc["similar_incidents"] = similar_check.get("similar_incidents", [])
    return inv_doc


async def update_investigation(user: dict, inv_id: str, update_data: dict) -> dict:
    inv = await _inv_repo.find_one(investigation_query(user, inv_id=inv_id), user=user)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    payload = {k: v for k, v in update_data.items() if v is not None}
    if "status" in payload and isinstance(payload["status"], InvestigationStatus):
        payload["status"] = payload["status"].value

    if payload:
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _inv_repo.update_one({"id": inv_id}, {"$set": payload}, user=user)

    updated = await _inv_repo.find_one({"id": inv_id}, user=user, projection={"_id": 0})
    return updated or {}


async def delete_investigation(
    user: dict,
    inv_id: str,
    *,
    delete_central_actions: bool = False,
) -> dict:
    try:
        result = await delete_investigation_cascade(
            inv_id=inv_id,
            delete_central_actions=delete_central_actions,
            user=user,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status_code=404, detail="Investigation not found") from exc
        if code == "forbidden":
            raise HTTPException(status_code=403, detail="Not allowed to delete this investigation") from exc
        raise

    return {
        "message": "Investigation deleted",
        "deleted_central_actions": result.get("deleted_central_actions", 0),
    }


# --- Wave 7: sub-resources ---

async def create_timeline_event(user: dict, inv_id: str,
    data: TimelineEventCreate,
):
    """Add a timeline event to an investigation."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    event_id = str(uuid.uuid4())
    event_doc = with_tenant_id({
        "id": event_id,
        "investigation_id": inv_id,
        "event_time": data.event_time,
        "description": data.description,
        "category": data.category.value,
        "evidence_source": data.evidence_source,
        "confidence": data.confidence.value,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }, user)
    
    await db.timeline_events.insert_one(event_doc)
    event_doc.pop("_id", None)
    return event_doc


async def update_timeline_event(user: dict, inv_id: str,
    event_id: str,
    update: TimelineEventUpdate,
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


async def delete_timeline_event(user: dict, inv_id: str,
    event_id: str,
):
    """Delete a timeline event."""
    result = await db.timeline_events.delete_one({"id": event_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}

async def create_failure_identification(user: dict, inv_id: str,
    data: FailureIdentificationCreate,
):
    """Add a failure identification to an investigation."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    failure_id = str(uuid.uuid4())
    failure_doc = with_tenant_id({
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
    }, user)
    
    await db.failure_identifications.insert_one(failure_doc)
    failure_doc.pop("_id", None)
    return failure_doc


async def update_failure_identification(user: dict, inv_id: str,
    failure_id: str,
    update: FailureIdentificationUpdate,
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


async def delete_failure_identification(user: dict, inv_id: str,
    failure_id: str,
):
    """Delete a failure identification."""
    result = await db.failure_identifications.delete_one({"id": failure_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Failure identification not found")
    return {"message": "Failure identification deleted"}

async def create_cause_node(user: dict, inv_id: str,
    data: CauseNodeCreate,
):
    """Add a cause node to the causal tree."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Validate parent exists if specified
    if data.parent_id:
        parent = await db.cause_nodes.find_one({"id": data.parent_id, "investigation_id": inv_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent cause node not found")
    
    cause_id = str(uuid.uuid4())
    cause_doc = with_tenant_id({
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
    }, user)
    
    await db.cause_nodes.insert_one(cause_doc)
    cause_doc.pop("_id", None)

    from services.reliability_graph import dispatch_graph_sync

    await dispatch_graph_sync(
        "sync_cause_edge",
        "investigation_cause",
        investigation_id=inv_id,
        cause_id=cause_id,
        equipment_id=inv.get("asset_id"),
        is_root_cause=data.is_root_cause,
        tenant_id=cause_doc.get("tenant_id"),
    )
    return cause_doc


async def update_cause_node(user: dict, inv_id: str,
    cause_id: str,
    update: CauseNodeUpdate,
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


async def delete_cause_node(user: dict, inv_id: str,
    cause_id: str,
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



async def create_action_item(user: dict, inv_id: str,
    data: ActionItemCreate,
):
    """Add an action item to an investigation."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    action_id = str(uuid.uuid4())
    action_number = await generate_action_number(inv_id)
    
    action_doc = with_tenant_id({
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
    }, user)
    
    await db.action_items.insert_one(action_doc)
    action_doc.pop("_id", None)
    await upsert_central_from_action_item(
        action_doc,
        inv,
        created_by=user.get("id"),
    )
    return action_doc


async def update_action_item(user: dict, inv_id: str,
    action_id: str,
    update: ActionItemUpdate,
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
    if updated:
        inv = await db.investigations.find_one({"id": inv_id}, {"_id": 0})
        if inv:
            await upsert_central_from_action_item(
                updated,
                inv,
                created_by=user.get("id"),
            )
    
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


async def delete_action_item(user: dict, inv_id: str,
    action_id: str,
):
    """Delete an action item."""
    result = await db.action_items.delete_one({"id": action_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action item not found")
    await delete_central_for_action_item(action_id)
    return {"message": "Action item deleted"}



async def add_evidence(user: dict, inv_id: str,
    data: EvidenceCreate,
):
    """Add evidence to an investigation."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    evidence_id = str(uuid.uuid4())
    evidence_doc = with_tenant_id({
        "id": evidence_id,
        "investigation_id": inv_id,
        "name": data.name,
        "evidence_type": data.evidence_type,
        "description": data.description,
        "file_url": data.file_url,
        "linked_event_id": data.linked_event_id,
        "linked_cause_id": data.linked_cause_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }, user)
    
    await db.evidence_items.insert_one(evidence_doc)
    evidence_doc.pop("_id", None)
    return evidence_doc


async def delete_evidence(user: dict, inv_id: str,
    evidence_id: str,
):
    """Delete evidence."""
    result = await db.evidence_items.delete_one({"id": evidence_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {"message": "Evidence deleted"}

async def get_similar_incidents(user: dict, inv_id: str,
):
    """
    Find similar past incidents for a given investigation.
    Used to help identify recurring issues.
    """
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id),
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    similar = await check_for_similar_incidents(
        user["id"],
        inv.get("asset_name"),
        inv.get("description"),
        exclude_id=inv_id
    )
    
    return similar


async def get_linked_incident(user: dict, inv_id: str,
):
    """
    Get the details of the linked previous incident for recurring analysis.
    """
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id),
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    linked_id = inv.get("linked_incident_id")
    if not linked_id:
        return {"linked_incident": None}
    
    linked_inv = await db.investigations.find_one(
        {"id": linked_id, "created_by": user["id"]},
        {"_id": 0, "id": 1, "case_number": 1, "title": 1, "description": 1, 
         "asset_name": 1, "incident_date": 1, "status": 1, "recurring_quadrant": 1}
    )
    
    return {"linked_incident": linked_inv}


async def update_recurring_quadrant(user: dict, inv_id: str,
    quadrant_data: RecurringQuadrantData,
):
    """
    Update the IS/IS NOT quadrant data for recurring issue analysis.
    """
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
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


async def link_incident(user: dict, inv_id: str, linked_incident_id: str):
    """
    Link an investigation to a previous similar incident for recurring analysis.
    """
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Verify linked incident exists
    linked_inv = await db.investigations.find_one(
        {"id": linked_incident_id, "created_by": user["id"]}
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


async def unlink_incident(user: dict, inv_id: str,
):
    """
    Remove the link to a previous incident.
    """
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
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


DEFENSIVE_REASONING_CHECK_PROMPT = """You are an expert in Root Cause Analysis (RCA) and reliability engineering. Your role is to help engineers write better problem statements by identifying and removing DEFENSIVE REASONING patterns that block effective investigation.

Respond with JSON only:
{
  "analysis": {"blame_patterns": [], "assumption_patterns": [], "solution_patterns": [], "clarity_score": "red|yellow|green"},
  "has_issues": true/false,
  "refined_description": "Improved neutral problem statement",
  "guidance": ["Specific suggestions"],
  "changes_made": ["List of specific changes made to improve the statement"]
}

Be thorough but constructive. The goal is to help the investigator, not criticize them."""


async def upload_investigation_file(
    user: dict,
    inv_id: str,
    *,
    file_data: bytes,
    filename: str,
    content_type: str,
    description: Optional[str] = None,
) -> dict:
    """Upload a file to an investigation and create an evidence record."""
    inv = await db.investigations.find_one(investigation_query(user, inv_id=inv_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if not filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    resolved_content_type = content_type or MIME_TYPES.get(ext, "application/octet-stream")
    image_exts = ["jpg", "jpeg", "png", "gif", "webp"]
    doc_exts = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"]
    if ext in image_exts:
        evidence_type = "photo"
    elif ext in doc_exts:
        evidence_type = "document"
    else:
        evidence_type = "file"

    file_size = len(file_data)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")

    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/investigations/{inv_id}/{file_id}.{ext}"

    try:
        result = await put_object_async(storage_path, file_data, resolved_content_type)
        evidence_doc = {
            "id": file_id,
            "investigation_id": inv_id,
            "name": filename,
            "evidence_type": evidence_type,
            "description": description,
            "storage_path": result["path"],
            "content_type": resolved_content_type,
            "file_size": file_size,
            "original_filename": filename,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.evidence_items.insert_one(evidence_doc)
        evidence_doc.pop("_id", None)
        return evidence_doc
    except Exception as exc:
        logger.error("File upload failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File upload failed: {exc}") from exc


async def download_file(user: dict, path: str) -> Tuple[bytes, str, str]:
    """Return file bytes, content type, and original filename for a storage path."""
    record = await db.evidence_items.find_one({"storage_path": path, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        data, content_type = await get_object_async(path)
        return (
            data,
            record.get("content_type", content_type),
            record.get("original_filename", "download"),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found in storage") from exc
    except Exception as exc:
        logger.error("File download failed: %s", exc)
        raise HTTPException(status_code=500, detail="File download failed") from exc


async def ai_problem_check(user: dict, inv_id: str, description: str) -> dict:
    """Analyze investigation description for defensive reasoning patterns."""
    from services.ai_citation import attach_citations_to_response, format_citations_for_prompt
    from services.ai_evidence_pack import build_evidence_pack

    inv = await db.investigations.find_one(investigation_query(user, inv_id=inv_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    description = description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Description cannot be empty")

    equipment_id = inv.get("asset_id")
    evidence_pack = None
    if equipment_id:
        try:
            evidence_pack = await build_evidence_pack(
                user=user,
                equipment_id=equipment_id,
                intent="investigation",
            )
        except Exception as exc:
            logger.warning("investigation evidence pack failed: %s", exc)

    try:
        uid, cid = user_context(user)
        user_content = f"Analyze this problem statement for defensive reasoning:\n\n{description}"
        if evidence_pack and evidence_pack.get("prompt_summary"):
            user_content += (
                f"\n\nLinked equipment evidence:\n{evidence_pack['prompt_summary']}\n"
                f"{format_citations_for_prompt(evidence_pack.get('citations') or [])}"
            )
        content = await ai_gateway_chat(
            [
                {"role": "system", "content": DEFENSIVE_REASONING_CHECK_PROMPT},
                {"role": "user", "content": user_content},
            ],
            user_id=uid,
            company_id=cid,
            endpoint="investigations.ai_problem_check",
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=2000,
        )
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip().rstrip("```")
        result = json.loads(content)
        payload = {
            "analysis": result.get("analysis", {}),
            "has_issues": result.get("has_issues", False),
            "refined_description": result.get("refined_description", description),
            "guidance": result.get("guidance", []),
            "changes_made": result.get("changes_made", []),
        }
        return attach_citations_to_response(
            payload,
            (evidence_pack or {}).get("citations") or [],
            evidence=evidence_pack,
        )
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse AI response: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to parse AI response") from exc
    except Exception as exc:
        logger.error("AI problem check failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {exc}") from exc
