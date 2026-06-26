"""Investigation sub-resource CRUD (timeline, causes, actions, evidence, recurring)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from database import db
from investigation_models import (
    ActionItemCreate,
    ActionItemUpdate,
    ActionPriority,
    ActionStatus,
    CauseCategory,
    CauseNodeCreate,
    CauseNodeUpdate,
    ConfidenceLevel,
    EventCategory,
    EvidenceCreate,
    FailureIdentificationCreate,
    FailureIdentificationUpdate,
    RecurringQuadrantData,
    TimelineEventCreate,
    TimelineEventUpdate,
)
from services.investigation_action_bridge import (
    delete_central_for_action_item,
    upsert_central_from_action_item,
)
from services.investigation_crud import generate_action_number
from services.investigation_queries import investigation_query, inv_child_query
from services.tenant_schema import with_tenant_id
from services.tenant_scope import scoped


async def create_timeline_event(user: dict, inv_id: str, data: TimelineEventCreate):
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


async def update_timeline_event(user: dict, inv_id: str, event_id: str, update: TimelineEventUpdate):
    """Update a timeline event."""
    event = await db.timeline_events.find_one(inv_child_query(user, inv_id, {"id": event_id}))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "category" in update_data and isinstance(update_data["category"], EventCategory):
        update_data["category"] = update_data["category"].value
    if "confidence" in update_data and isinstance(update_data["confidence"], ConfidenceLevel):
        update_data["confidence"] = update_data["confidence"].value

    if update_data:
        await db.timeline_events.update_one(
            inv_child_query(user, inv_id, {"id": event_id}),
            {"$set": update_data},
        )

    updated = await db.timeline_events.find_one(
        inv_child_query(user, inv_id, {"id": event_id}), {"_id": 0}
    )
    return updated


async def delete_timeline_event(user: dict, inv_id: str, event_id: str):
    """Delete a timeline event."""
    result = await db.timeline_events.delete_one(inv_child_query(user, inv_id, {"id": event_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}


async def create_failure_identification(user: dict, inv_id: str, data: FailureIdentificationCreate):
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


async def update_failure_identification(
    user: dict, inv_id: str, failure_id: str, update: FailureIdentificationUpdate
):
    """Update a failure identification."""
    failure = await db.failure_identifications.find_one(
        inv_child_query(user, inv_id, {"id": failure_id})
    )
    if not failure:
        raise HTTPException(status_code=404, detail="Failure identification not found")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.failure_identifications.update_one(
            inv_child_query(user, inv_id, {"id": failure_id}),
            {"$set": update_data},
        )

    updated = await db.failure_identifications.find_one(
        inv_child_query(user, inv_id, {"id": failure_id}), {"_id": 0}
    )
    return updated


async def delete_failure_identification(user: dict, inv_id: str, failure_id: str):
    """Delete a failure identification."""
    result = await db.failure_identifications.delete_one(
        inv_child_query(user, inv_id, {"id": failure_id})
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Failure identification not found")
    return {"message": "Failure identification deleted"}


async def create_cause_node(user: dict, inv_id: str, data: CauseNodeCreate):
    """Add a cause node to the causal tree."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if data.parent_id:
        parent = await db.cause_nodes.find_one(
            inv_child_query(user, inv_id, {"id": data.parent_id})
        )
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


async def update_cause_node(user: dict, inv_id: str, cause_id: str, update: CauseNodeUpdate):
    """Update a cause node."""
    cause = await db.cause_nodes.find_one(inv_child_query(user, inv_id, {"id": cause_id}))
    if not cause:
        raise HTTPException(status_code=404, detail="Cause node not found")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "category" in update_data and isinstance(update_data["category"], CauseCategory):
        update_data["category"] = update_data["category"].value

    if update_data:
        await db.cause_nodes.update_one(
            inv_child_query(user, inv_id, {"id": cause_id}),
            {"$set": update_data},
        )

    updated = await db.cause_nodes.find_one(
        inv_child_query(user, inv_id, {"id": cause_id}), {"_id": 0}
    )
    return updated


async def delete_cause_node(user: dict, inv_id: str, cause_id: str):
    """Delete a cause node and its children."""
    async def get_children_ids(parent_id):
        children = await db.cause_nodes.find(
            inv_child_query(user, inv_id, {"parent_id": parent_id}),
            {"_id": 0, "id": 1}
        ).to_list(100)
        all_ids = [c["id"] for c in children]
        for child in children:
            all_ids.extend(await get_children_ids(child["id"]))
        return all_ids

    children_ids = await get_children_ids(cause_id)
    all_ids = [cause_id] + children_ids

    result = await db.cause_nodes.delete_many(
        scoped(user, {"id": {"$in": all_ids}, "investigation_id": inv_id})
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cause node not found")

    return {"message": f"Deleted {result.deleted_count} cause nodes"}


async def create_action_item(user: dict, inv_id: str, data: ActionItemCreate):
    """Add an action item to an investigation."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    action_id = str(uuid.uuid4())
    action_number = await generate_action_number(user, inv_id)

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


async def update_action_item(user: dict, inv_id: str, action_id: str, update: ActionItemUpdate):
    """Update an action item."""
    action = await db.action_items.find_one(inv_child_query(user, inv_id, {"id": action_id}))
    if not action:
        raise HTTPException(status_code=404, detail="Action item not found")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "priority" in update_data and isinstance(update_data["priority"], ActionPriority):
        update_data["priority"] = update_data["priority"].value
    if "status" in update_data and isinstance(update_data["status"], ActionStatus):
        update_data["status"] = update_data["status"].value

    status_changed_to_completed = (
        update_data.get("status") == "completed" and
        action.get("status") != "completed"
    )

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.action_items.update_one(
            inv_child_query(user, inv_id, {"id": action_id}),
            {"$set": update_data},
        )

    updated = await db.action_items.find_one(
        inv_child_query(user, inv_id, {"id": action_id}), {"_id": 0}
    )
    if updated:
        inv = await db.investigations.find_one(investigation_query(user, inv_id=inv_id), {"_id": 0})
        if inv:
            await upsert_central_from_action_item(
                updated,
                inv,
                created_by=user.get("id"),
            )

    completion_notification = None
    if status_changed_to_completed:
        remaining_open = await db.action_items.count_documents(
            inv_child_query(user, inv_id, {"status": {"$ne": "completed"}})
        )

        if remaining_open == 0:
            total_actions = await db.action_items.count_documents(inv_child_query(user, inv_id))
            inv = await db.investigations.find_one(
                investigation_query(user, inv_id=inv_id), {"_id": 0, "title": 1, "status": 1}
            )
            inv_name = inv.get("title", "Investigation") if inv else "Investigation"
            inv_status = inv.get("status") if inv else None

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


async def delete_action_item(user: dict, inv_id: str, action_id: str):
    """Delete an action item."""
    result = await db.action_items.delete_one(inv_child_query(user, inv_id, {"id": action_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action item not found")
    await delete_central_for_action_item(action_id)
    return {"message": "Action item deleted"}


async def add_evidence(user: dict, inv_id: str, data: EvidenceCreate):
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


async def delete_evidence(user: dict, inv_id: str, evidence_id: str):
    """Delete evidence."""
    result = await db.evidence_items.delete_one(inv_child_query(user, inv_id, {"id": evidence_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {"message": "Evidence deleted"}


async def update_recurring_quadrant(user: dict, inv_id: str, quadrant_data: RecurringQuadrantData):
    """Update the IS/IS NOT quadrant data for recurring issue analysis."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if inv.get("status") in ["completed", "closed"]:
        raise HTTPException(status_code=400, detail="Cannot modify completed/closed investigation")

    update_data = {
        "recurring_quadrant": quadrant_data.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.investigations.update_one(
        investigation_query(user, inv_id=inv_id),
        {"$set": update_data}
    )

    return {"message": "Quadrant data updated", "recurring_quadrant": quadrant_data.model_dump()}


async def link_incident(user: dict, inv_id: str, linked_incident_id: str):
    """Link an investigation to a previous similar incident for recurring analysis."""
    inv = await db.investigations.find_one(
        investigation_query(user, inv_id=inv_id)
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    linked_inv = await db.investigations.find_one(
        investigation_query(user, inv_id=linked_incident_id)
    )
    if not linked_inv:
        raise HTTPException(status_code=404, detail="Linked incident not found")

    if inv_id == linked_incident_id:
        raise HTTPException(status_code=400, detail="Cannot link investigation to itself")

    update_data = {
        "linked_incident_id": linked_incident_id,
        "is_recurring": True,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.investigations.update_one(
        investigation_query(user, inv_id=inv_id),
        {"$set": update_data}
    )

    return {
        "message": "Incident linked successfully",
        "linked_incident_id": linked_incident_id,
        "is_recurring": True
    }


async def unlink_incident(user: dict, inv_id: str):
    """Remove the link to a previous incident."""
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
        investigation_query(user, inv_id=inv_id),
        {"$set": update_data}
    )

    return {"message": "Incident unlinked successfully"}
