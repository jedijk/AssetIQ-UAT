"""
Sync helpers between Causal Investigations and the Action Plan.

Rules:
- When an investigation is created → an action "Complete causal investigation"
  is auto-added to the observation's plan, linked to the investigation.
- When the investigation moves to in_progress / completed / closed → the action
  is marked completed.
- When the investigation is deleted → the linked action is deleted.
- When the linked action is deleted → the investigation is untouched.

The linked action is identified by `source_type == "investigation"` AND
`source_id == <investigation id>`.
"""

from datetime import datetime, timezone
from typing import Optional
import uuid

from database import db
from services.action_number_service import allocate_central_action_number

INVESTIGATION_ACTION_TITLE = "Complete causal investigation"


async def create_investigation_action(
    investigation_id: str,
    threat_id: Optional[str],
    user: dict,
) -> Optional[dict]:
    """Create the linked "Complete causal investigation" action.

    No-op if an action already links to this investigation. Returns the created
    (or pre-existing) action dict.
    """
    existing = await db.central_actions.find_one(
        {"source_type": "investigation", "source_id": investigation_id},
        {"_id": 0}
    )
    if existing:
        return existing

    # Resolve the parent observation to attach the action to (if available)
    observation = None
    if threat_id:
        observation = await db.threats.find_one({"id": threat_id}, {"_id": 0})

    investigation = await db.investigations.find_one(
        {"id": investigation_id},
        {"_id": 0, "title": 1, "case_number": 1},
    )
    investigation_title = (
        (investigation or {}).get("title")
        or (investigation or {}).get("case_number")
        or "Investigation"
    )

    action_number = await allocate_central_action_number()
    now = datetime.now(timezone.utc).isoformat()

    new_action = {
        "id": str(uuid.uuid4()),
        "action_number": action_number,
        "title": INVESTIGATION_ACTION_TITLE,
        "description": "Auto-generated action — opens the linked Causal Engine investigation.",
        "action_type": "OP",
        "status": "open",
        "priority": "medium",
        "discipline": "Reliability",
        "source_type": "investigation",
        "source_id": investigation_id,
        "source_name": investigation_title,
        "linked_investigation_id": investigation_id,
        "threat_id": threat_id,
        "observation_id": threat_id,
        "linked_equipment_id": (observation or {}).get("linked_equipment_id"),
        "equipment_name": (observation or {}).get("asset"),
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("id"),
        "created_by_name": user.get("name"),
    }
    await db.central_actions.insert_one(new_action)
    new_action.pop("_id", None)
    return new_action


async def sync_action_to_investigation_status(
    investigation_id: str,
    new_status: str,
) -> None:
    """If the investigation moved to in_progress / completed / closed, mark
    the linked action completed. Otherwise leave the action alone."""
    new_status = (new_status or "").lower()
    if new_status not in ("in_progress", "completed", "closed", "review"):
        return

    target_status = "completed" if new_status in ("completed", "closed") else "in_progress"

    await db.central_actions.update_many(
        {
            "source_type": "investigation",
            "source_id": investigation_id,
            "status": {"$ne": target_status},
        },
        {
            "$set": {
                "status": target_status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        }
    )


async def delete_investigation_action(investigation_id: str) -> int:
    """Delete the action linked to a (now deleted) investigation."""
    result = await db.central_actions.delete_many({
        "source_type": "investigation",
        "source_id": investigation_id,
    })
    return result.deleted_count
