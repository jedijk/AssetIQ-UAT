"""Decision engine suggestion workflow and execution logging."""
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

from bson import ObjectId
import logging

logger = logging.getLogger(__name__)


def serialize_suggestion(doc: Dict) -> Dict[str, Any]:
    """Serialize suggestion document."""
    return {
        "id": str(doc["_id"]),
        "rule_id": doc["rule_id"],
        "suggestion_type": doc["suggestion_type"],
        "target_type": doc["target_type"],
        "target_id": doc.get("target_id"),
        "title": doc["title"],
        "description": doc["description"],
        "recommended_action": doc.get("recommended_action", {}),
        "priority": doc.get("priority", "medium"),
        "status": doc["status"],
        "created_by": doc.get("created_by"),
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        "approved_by": doc.get("approved_by"),
        "approved_at": doc.get("approved_at").isoformat() if doc.get("approved_at") else None,
        "rejected_by": doc.get("rejected_by"),
        "rejection_reason": doc.get("rejection_reason"),
        "executed_by": doc.get("executed_by"),
        "executed_at": doc.get("executed_at").isoformat() if doc.get("executed_at") else None,
    }


async def create_suggestion(
    *,
    suggestions,
    rule_id: str,
    suggestion_type: str,
    target_type: str,
    target_id: Optional[str],
    title: str,
    description: str,
    recommended_action: Dict,
    priority: str,
    created_by: str,
) -> Optional[Dict[str, Any]]:
    """Create a suggestion from rule evaluation."""
    existing = await suggestions.find_one({
        "rule_id": rule_id,
        "target_type": target_type,
        "target_id": target_id,
        "status": {"$in": ["pending", "approved"]},
    })

    if existing:
        return None

    now = datetime.now(timezone.utc)
    doc = {
        "rule_id": rule_id,
        "suggestion_type": suggestion_type,
        "target_type": target_type,
        "target_id": target_id,
        "title": title,
        "description": description,
        "recommended_action": recommended_action,
        "priority": priority,
        "status": "pending",
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }

    result = await suggestions.insert_one(doc)
    doc["_id"] = result.inserted_id

    return serialize_suggestion(doc)


async def get_suggestions(
    *,
    suggestions,
    status: Optional[str] = None,
    rule_id: Optional[str] = None,
    priority: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> Dict[str, Any]:
    """Get decision suggestions."""
    query: Dict[str, Any] = {}

    if status:
        query["status"] = status
    if rule_id:
        query["rule_id"] = rule_id
    if priority:
        query["priority"] = priority

    cursor = suggestions.find(query).sort("created_at", -1).skip(skip).limit(limit)

    items = []
    async for doc in cursor:
        items.append(serialize_suggestion(doc))

    total = await suggestions.count_documents(query)

    return {"total": total, "suggestions": items}


async def approve_suggestion(
    *,
    suggestions,
    suggestion_id: str,
    approved_by: str,
    notes: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Approve a suggestion for execution."""
    if not ObjectId.is_valid(suggestion_id):
        return None

    result = await suggestions.find_one_and_update(
        {"_id": ObjectId(suggestion_id), "status": "pending"},
        {"$set": {
            "status": "approved",
            "approved_by": approved_by,
            "approved_at": datetime.now(timezone.utc),
            "approval_notes": notes,
            "updated_at": datetime.now(timezone.utc),
        }},
        return_document=True,
    )

    if result:
        return serialize_suggestion(result)
    return None


async def reject_suggestion(
    *,
    suggestions,
    suggestion_id: str,
    rejected_by: str,
    reason: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Reject a suggestion."""
    if not ObjectId.is_valid(suggestion_id):
        return None

    result = await suggestions.find_one_and_update(
        {"_id": ObjectId(suggestion_id), "status": "pending"},
        {"$set": {
            "status": "rejected",
            "rejected_by": rejected_by,
            "rejected_at": datetime.now(timezone.utc),
            "rejection_reason": reason,
            "updated_at": datetime.now(timezone.utc),
        }},
        return_document=True,
    )

    if result:
        return serialize_suggestion(result)
    return None


async def execute_suggestion(
    *,
    suggestions,
    task_plans,
    rule_executions,
    suggestion_id: str,
    executed_by: str,
) -> Dict[str, Any]:
    """Execute an approved suggestion."""
    if not ObjectId.is_valid(suggestion_id):
        raise ValueError("Invalid suggestion ID")

    suggestion = await suggestions.find_one({"_id": ObjectId(suggestion_id)})
    if not suggestion:
        raise ValueError("Suggestion not found")

    if suggestion.get("status") != "approved":
        raise ValueError("Suggestion must be approved before execution")

    action = suggestion.get("recommended_action", {})
    action_type = action.get("action")
    result = {"executed": False, "details": {}}

    try:
        if action_type == "update_interval":
            target_id = suggestion.get("target_id")
            new_interval = action.get("suggested_interval")

            await task_plans.update_one(
                {"_id": ObjectId(target_id)},
                {"$set": {
                    "interval_value": new_interval,
                    "updated_at": datetime.now(timezone.utc),
                }},
            )
            result["executed"] = True
            result["details"] = {"new_interval": new_interval}

        await suggestions.update_one(
            {"_id": ObjectId(suggestion_id)},
            {"$set": {
                "status": "executed",
                "executed_by": executed_by,
                "executed_at": datetime.now(timezone.utc),
                "execution_result": result,
                "updated_at": datetime.now(timezone.utc),
            }},
        )

        await log_execution(
            rule_executions=rule_executions,
            rule_id=suggestion.get("rule_id"),
            action=action_type,
            target_type=suggestion.get("target_type"),
            target_id=suggestion.get("target_id"),
            details=result,
            executed_by=executed_by,
        )

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Error executing suggestion {suggestion_id}: {e}")

    return result


async def log_execution(
    *,
    rule_executions,
    rule_id: str,
    action: str,
    target_type: str,
    target_id: str,
    details: Dict,
    executed_by: str,
):
    """Log a rule execution."""
    await rule_executions.insert_one({
        "rule_id": rule_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "details": details,
        "executed_by": executed_by,
        "executed_at": datetime.now(timezone.utc),
    })
