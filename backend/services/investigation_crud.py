"""Investigation create/update/delete operations."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from database import db
from investigation_models import InvestigationStatus
from repositories.investigation_repository import InvestigationRepository, delete_investigation_cascade
from services.investigation_queries import (
    _inv_repo,
    check_for_similar_incidents,
    investigation_query,
    inv_child_query,
)
from services.tenant_schema import with_tenant_id

async def generate_case_number(user: dict) -> str:
    count = await _inv_repo.count({"created_by": user["id"]}, user=user)
    year = datetime.now(timezone.utc).strftime("%Y")
    return f"INV-{year}-{count + 1:04d}"


async def generate_action_number(user: dict, investigation_id: str) -> str:
    count = await db.action_items.count_documents(inv_child_query(user, investigation_id))
    return f"ACT-{count + 1:03d}"


async def create_investigation(user: dict, data: dict) -> dict:
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(user)

    similar_check = await check_for_similar_incidents(
        user, data.get("asset_name", ""), data.get("description", "")
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
