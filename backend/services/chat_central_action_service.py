"""Create central_actions rows for auto-generated chat observation actions."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db
from services.action_number_service import allocate_central_action_number

_ACTION_TYPE_MAP = {
    "PM": "preventive",
    "CM": "corrective",
    "PDM": "predictive",
    "OP": "operational",
}


def _normalize_priority(value: Optional[str]) -> str:
    if not value:
        return "medium"
    return str(value).strip().lower()


def _normalize_action_type(value: Optional[str]) -> str:
    raw = (value or "CM").strip().upper()
    return _ACTION_TYPE_MAP.get(raw, "corrective")


async def create_chat_central_action(
    *,
    user_id: str,
    threat_id: str,
    threat_title: str,
    title: str,
    description: str,
    action_type: str = "CM",
    discipline: str = "Mechanical",
    priority: str = "medium",
    linked_equipment_id: Optional[str] = None,
    equipment_name: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    failure_mode_name: Optional[str] = None,
    auto_source: str,
    installation_id: Optional[str] = None,
    rpn: Optional[int] = None,
    risk_score: Optional[int] = None,
    risk_level: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a central_actions document for chat auto-created work items."""
    action_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    action_number = await allocate_central_action_number()

    action_doc: Dict[str, Any] = {
        "id": action_id,
        "action_number": action_number,
        "title": (title or "")[:200],
        "description": description or "",
        "action_type": _normalize_action_type(action_type),
        "status": "open",
        "priority": _normalize_priority(priority),
        "discipline": discipline or "Mechanical",
        "source": "observation",
        "source_type": "threat",
        "source_id": threat_id,
        "source_name": threat_title,
        "observation_id": threat_id,
        "threat_id": threat_id,
        "linked_equipment_id": linked_equipment_id,
        "equipment_name": equipment_name,
        "failure_mode_id": failure_mode_id,
        "failure_mode_name": failure_mode_name,
        "installation_id": installation_id,
        "rpn": rpn,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    if auto_source == "failure_mode":
        action_doc["auto_created_from_failure_mode"] = True
    elif auto_source == "image_analysis":
        action_doc["auto_created_from_image_analysis"] = True

    await db.central_actions.insert_one(action_doc)
    action_doc.pop("_id", None)

    from services.reliability_graph import dispatch_graph_sync

    await dispatch_graph_sync(
        "sync_action_edges",
        "chat_action_create",
        action_id=action_id,
        source_type="threat",
        source_id=threat_id,
        equipment_id=linked_equipment_id,
        failure_mode_id=str(failure_mode_id) if failure_mode_id else None,
    )

    return action_doc
