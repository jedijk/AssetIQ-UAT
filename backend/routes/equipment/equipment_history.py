"""
Equipment History Timeline.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from database import db
from auth import get_current_user

router = APIRouter()


@router.get("/equipment-hierarchy/nodes/{node_id}/history")
async def get_equipment_history(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get the complete history timeline for an equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    equipment_name = node.get("name", "")
    timeline_items = []
    
    # Get observations linked to this equipment
    observations = await db.threats.find(
        {
            "created_by": current_user["id"],
            "$or": [
                {"linked_equipment_id": node_id},
                {"asset": {"$regex": f"^{equipment_name}$", "$options": "i"}}
            ]
        },
        {"_id": 0}
    ).to_list(100)
    
    for obs in observations:
        timeline_items.append({
            "id": obs.get("id"),
            "type": "observation",
            "title": obs.get("title", "Untitled Observation"),
            "description": obs.get("description", ""),
            "failure_mode": obs.get("failure_mode", ""),
            "status": obs.get("status", "open"),
            "risk_level": obs.get("risk_level", "medium"),
            "risk_score": obs.get("risk_score", 0),
            "created_at": obs.get("created_at"),
            "updated_at": obs.get("updated_at"),
            "source": "threat"
        })
    
    observation_ids = [obs.get("id") for obs in observations if obs.get("id")]
    
    # Get actions linked to this equipment
    action_query = {
        "created_by": current_user["id"],
        "$or": [
            {"linked_equipment_id": node_id},
            {"equipment_name": {"$regex": f"^{equipment_name}$", "$options": "i"}},
        ]
    }
    if observation_ids:
        action_query["$or"].append({"source_id": {"$in": observation_ids}})
    
    actions = await db.central_actions.find(
        action_query,
        {"_id": 0}
    ).to_list(100)
    
    for action in actions:
        timeline_items.append({
            "id": action.get("id"),
            "type": "action",
            "title": action.get("title", "Untitled Action"),
            "description": action.get("description", ""),
            "status": action.get("status", "open"),
            "priority": action.get("priority", "medium"),
            "due_date": action.get("due_date"),
            "created_at": action.get("created_at"),
            "updated_at": action.get("updated_at"),
            "source": "action"
        })
    
    # Get task instances linked to this equipment
    task_instances = await db.task_instances.find(
        {
            "created_by": current_user["id"],
            "$or": [
                {"linked_equipment_id": node_id},
                {"equipment_name": {"$regex": f"^{equipment_name}$", "$options": "i"}},
                {"equipment_id": node_id}
            ]
        },
        {"_id": 0}
    ).to_list(100)
    
    for task in task_instances:
        timeline_items.append({
            "id": task.get("id"),
            "type": "task",
            "title": task.get("name", task.get("task_name", "Untitled Task")),
            "description": task.get("description", ""),
            "status": task.get("status", "pending"),
            "scheduled_date": task.get("scheduled_date"),
            "completed_at": task.get("completed_at"),
            "created_at": task.get("created_at"),
            "updated_at": task.get("updated_at"),
            "source": "task"
        })
    
    # Sort timeline by date
    def get_sort_date(item):
        date_str = item.get("created_at") or item.get("scheduled_date") or ""
        if isinstance(date_str, str):
            try:
                return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return datetime.min.replace(tzinfo=timezone.utc)
        return datetime.min.replace(tzinfo=timezone.utc)
    
    timeline_items.sort(key=get_sort_date, reverse=True)
    
    return {
        "equipment_id": node_id,
        "equipment_name": equipment_name,
        "timeline": timeline_items,
        "total_items": len(timeline_items),
        "counts": {
            "observations": len([i for i in timeline_items if i["type"] == "observation"]),
            "actions": len([i for i in timeline_items if i["type"] == "action"]),
            "tasks": len([i for i in timeline_items if i["type"] == "task"])
        }
    }
