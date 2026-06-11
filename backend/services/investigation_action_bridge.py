"""
Bridge investigation ``action_items`` to ``central_actions`` (Phase 1C).

Investigation CRUD keeps writing ``action_items`` for backward-compatible API
responses; each write is mirrored to ``central_actions`` so the Actions inbox
and /actions/{id} routes stay unified.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db
from services.action_number_service import allocate_central_action_number

_INVESTIGATION_SOURCE = "investigation"


def _map_status(status: Optional[str]) -> str:
    raw = (status or "open").lower()
    if raw in ("completed", "closed"):
        return "completed"
    if raw == "in_progress":
        return "in_progress"
    return "open"


def action_item_to_central_doc(
    action_item: Dict[str, Any],
    investigation: Dict[str, Any],
    *,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Map an investigation action_item document to a central_actions row."""
    inv_id = action_item.get("investigation_id") or investigation.get("id")
    description = (action_item.get("description") or "").strip()
    title = description[:200] if description else "Investigation action"
    now = datetime.now(timezone.utc).isoformat()
    threat_id = investigation.get("threat_id")

    doc: Dict[str, Any] = {
        "id": action_item["id"],
        "action_number": action_item.get("action_number") or "",
        "title": title,
        "description": description,
        "source_type": _INVESTIGATION_SOURCE,
        "source_id": inv_id,
        "source_name": investigation.get("title") or investigation.get("case_number") or "",
        "linked_investigation_id": inv_id,
        "investigation_action_item": True,
        "linked_cause_id": action_item.get("linked_cause_id"),
        "threat_id": threat_id,
        "observation_id": threat_id,
        "linked_equipment_id": investigation.get("asset_id"),
        "equipment_name": investigation.get("asset_name"),
        "action_type": action_item.get("action_type") or "CM",
        "discipline": action_item.get("discipline") or "",
        "priority": action_item.get("priority") or "medium",
        "status": _map_status(action_item.get("status")),
        "assignee": action_item.get("owner") or "",
        "due_date": action_item.get("due_date") or None,
        "comments": action_item.get("comment") or "",
        "completion_notes": action_item.get("completion_notes"),
        "created_at": action_item.get("created_at") or now,
        "updated_at": action_item.get("updated_at") or now,
        "created_by": created_by or investigation.get("created_by"),
    }
    if action_item.get("tenant_id"):
        doc["tenant_id"] = action_item["tenant_id"]
    return doc


async def upsert_central_from_action_item(
    action_item: Dict[str, Any],
    investigation: Dict[str, Any],
    *,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert or update the central_actions mirror for an action_item."""
    central = action_item_to_central_doc(action_item, investigation, created_by=created_by)
    existing = await db.central_actions.find_one(
        {"id": central["id"]},
        {"action_number": 1},
    )
    if existing and existing.get("action_number"):
        central["action_number"] = existing["action_number"]
    else:
        central["action_number"] = await allocate_central_action_number()
    await db.central_actions.update_one(
        {"id": central["id"]},
        {"$set": central},
        upsert=True,
    )
    return central


async def delete_central_for_action_item(action_id: str) -> int:
    """Remove the central_actions row for a deleted investigation action_item."""
    result = await db.central_actions.delete_one({"id": action_id})
    return result.deleted_count
