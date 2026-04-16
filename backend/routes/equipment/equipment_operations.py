"""
Equipment Node Operations - Change Level, Reorder, Move.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth import get_current_user
from iso14224_models import (
    ISOLevel, ISO_LEVEL_ORDER, MoveNodeRequest,
    get_valid_child_levels, is_valid_parent_child, normalize_level
)
from services.query_cache import query_cache

router = APIRouter()


def invalidate_equipment_cache(user_id: str = None):
    """Invalidate equipment-related caches after mutations."""
    # Invalidate all equipment_nodes caches (pattern matches anywhere in key)
    query_cache.invalidate("equipment_nodes")


class ChangeLevelRequest(BaseModel):
    new_level: ISOLevel
    new_parent_id: Optional[str] = None


class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"


class ReorderToPositionRequest(BaseModel):
    target_node_id: str
    position: str  # "before" or "after"
    new_parent_id: Optional[str] = None


@router.post("/equipment-hierarchy/nodes/{node_id}/change-level")
async def change_node_level(
    node_id: str,
    request: ChangeLevelRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change the hierarchy level of a node (promote or demote)."""
    node = await db.equipment_nodes.find_one({"id": node_id})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    current_level = normalize_level(ISOLevel(node["level"]))
    new_level = normalize_level(request.new_level)
    
    current_idx = ISO_LEVEL_ORDER.index(current_level)
    new_idx = ISO_LEVEL_ORDER.index(new_level)
    
    if new_idx == current_idx:
        raise HTTPException(status_code=400, detail="Node is already at this level")
    
    is_promoting = new_idx < current_idx
    
    current_parent = None
    if node.get("parent_id"):
        current_parent = await db.equipment_nodes.find_one({"id": node["parent_id"]})
    
    if is_promoting:
        if not current_parent:
            raise HTTPException(status_code=400, detail="Cannot promote a root node")
        
        new_parent_id = current_parent.get("parent_id")
        
        if new_parent_id:
            grandparent = await db.equipment_nodes.find_one({"id": new_parent_id})
            if grandparent:
                grandparent_level = normalize_level(ISOLevel(grandparent["level"]))
                if not is_valid_parent_child(grandparent_level, new_level):
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Cannot promote to {new_level.value}. Invalid parent-child relationship."
                    )
        else:
            if new_level != ISOLevel.INSTALLATION:
                raise HTTPException(status_code=400, detail="Only installations can be root nodes")
        
    else:  # is_demoting
        if not request.new_parent_id:
            raise HTTPException(status_code=400, detail="Must specify new_parent_id when demoting")
        
        new_parent = await db.equipment_nodes.find_one({"id": request.new_parent_id})
        if not new_parent:
            raise HTTPException(status_code=400, detail="New parent node not found")
        
        parent_level = normalize_level(ISOLevel(new_parent["level"]))
        if not is_valid_parent_child(parent_level, new_level):
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot demote to {new_level.value} under {parent_level.value}"
            )
        
        new_parent_id = request.new_parent_id
    
    # Check for duplicate name at new location
    existing = await db.equipment_nodes.find_one({
        "name": node["name"],
        "parent_id": new_parent_id,
        "id": {"$ne": node_id}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node['name']}' already exists at the target location"
        )
    
    # Get the max sort_order of siblings at the new location and assign next value
    siblings_cursor = await db.equipment_nodes.find(
        {"parent_id": new_parent_id, "id": {"$ne": node_id}},
        {"sort_order": 1}
    ).to_list(1000)
    
    max_sort_order = -1
    for s in siblings_cursor:
        if s.get("sort_order") is not None and s.get("sort_order") > max_sort_order:
            max_sort_order = s.get("sort_order")
    
    new_sort_order = max_sort_order + 1
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "level": new_level.value,
            "parent_id": new_parent_id,
            "sort_order": new_sort_order,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate cache after mutation
    invalidate_equipment_cache(current_user["id"])
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    action = "promoted" if is_promoting else "demoted"
    return {"message": f"Node {action} to {new_level.value}", "node": updated}


@router.post("/equipment-hierarchy/nodes/{node_id}/reorder")
async def reorder_equipment_node(
    node_id: str,
    request: ReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node among its siblings (move up or down)."""
    if request.direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    node = await db.equipment_nodes.find_one({"id": node_id})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Get all siblings and sort properly (nulls at end)
    siblings_cursor = await db.equipment_nodes.find(
        {"parent_id": node["parent_id"]},
        {"_id": 0}
    ).to_list(1000)
    
    siblings = sorted(siblings_cursor, key=lambda x: (
        0 if x.get("sort_order") is not None else 1,
        x.get("sort_order") if x.get("sort_order") is not None else 0,
        x.get("name", "")
    ))
    
    if len(siblings) <= 1:
        raise HTTPException(status_code=400, detail="No siblings to reorder with")
    
    current_idx = next((i for i, s in enumerate(siblings) if s["id"] == node_id), -1)
    if current_idx == -1:
        raise HTTPException(status_code=400, detail="Node not found in siblings")
    
    if request.direction == "up":
        if current_idx == 0:
            raise HTTPException(status_code=400, detail="Already at the top")
        target_idx = current_idx - 1
    else:
        if current_idx == len(siblings) - 1:
            raise HTTPException(status_code=400, detail="Already at the bottom")
        target_idx = current_idx + 1
    
    # Ensure both nodes have proper sort_order values after swap
    target_node = siblings[target_idx]
    
    # Use the index as the sort_order to ensure proper ordering
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {"sort_order": target_idx, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.equipment_nodes.update_one(
        {"id": target_node["id"]},
        {"$set": {"sort_order": current_idx, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Invalidate cache after mutation
    invalidate_equipment_cache(current_user["id"])
    
    return {"message": f"Node moved {request.direction}", "new_sort_order": target_idx}


@router.post("/equipment-hierarchy/nodes/{node_id}/reorder-to")
async def reorder_node_to_position(
    node_id: str,
    request: ReorderToPositionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node to a specific position relative to another node via drag-and-drop."""
    if request.position not in ["before", "after"]:
        raise HTTPException(status_code=400, detail="Position must be 'before' or 'after'")
    
    node = await db.equipment_nodes.find_one({"id": node_id})
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    target = await db.equipment_nodes.find_one({"id": request.target_node_id})
    if not target:
        raise HTTPException(status_code=404, detail="Target node not found")
    
    new_parent_id = request.new_parent_id if request.new_parent_id is not None else target.get("parent_id")
    
    # If moving to a different parent, validate the level relationship
    if new_parent_id != node.get("parent_id"):
        if new_parent_id:
            new_parent = await db.equipment_nodes.find_one({"id": new_parent_id})
            if not new_parent:
                raise HTTPException(status_code=400, detail="New parent not found")
            
            parent_level = ISOLevel(new_parent["level"])
            child_level = ISOLevel(node["level"])
            if not is_valid_parent_child(parent_level, child_level):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot place {child_level.value} under {parent_level.value}"
                )
        else:
            if node["level"] != "installation":
                raise HTTPException(status_code=400, detail="Only installations can be at root level")
    
    # Get all siblings (excluding the node being moved) and sort properly
    # Nodes without sort_order should appear at the end
    siblings_cursor = await db.equipment_nodes.find(
        {"parent_id": new_parent_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Filter out the node being moved and sort:
    # - Nodes with sort_order come first, sorted by sort_order
    # - Nodes without sort_order come last, sorted by name
    siblings = [s for s in siblings_cursor if s["id"] != node_id]
    siblings.sort(key=lambda x: (
        0 if x.get("sort_order") is not None else 1,  # Has sort_order first
        x.get("sort_order") if x.get("sort_order") is not None else 0,
        x.get("name", "")
    ))
    
    target_idx = next((i for i, s in enumerate(siblings) if s["id"] == request.target_node_id), -1)
    
    if target_idx == -1:
        insert_idx = len(siblings)
    elif request.position == "before":
        insert_idx = target_idx
    else:
        insert_idx = target_idx + 1
    
    # Update all siblings to have sequential sort_order values
    for i, sibling in enumerate(siblings):
        new_sort = i if i < insert_idx else i + 1
        # Always update to ensure all siblings have proper sort_order
        await db.equipment_nodes.update_one(
            {"id": sibling["id"]},
            {"$set": {"sort_order": new_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "sort_order": insert_idx,
            "parent_id": new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate cache after mutation
    invalidate_equipment_cache(current_user["id"])
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return {"message": f"Node moved {request.position} target", "node": updated}


@router.post("/equipment-hierarchy/nodes/{node_id}/move")
async def move_equipment_node(
    node_id: str,
    move_request: MoveNodeRequest,
    current_user: dict = Depends(get_current_user)
):
    """Move a node to a new parent with ISO 14224 validation."""
    node = await db.equipment_nodes.find_one({"id": node_id})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    new_parent = await db.equipment_nodes.find_one({"id": move_request.new_parent_id})
    if not new_parent:
        raise HTTPException(status_code=400, detail="New parent node not found")
    
    # Check for duplicate name under the new parent
    existing = await db.equipment_nodes.find_one({
        "name": node["name"],
        "parent_id": move_request.new_parent_id,
        "id": {"$ne": node_id}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node['name']}' already exists under the target parent"
        )
    
    parent_level = ISOLevel(new_parent["level"])
    child_level = ISOLevel(node["level"])
    
    if not is_valid_parent_child(parent_level, child_level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot move {child_level.value} under {parent_level.value}. Valid children: {[c.value for c in valid_children]}"
        )
    
    # Get the max sort_order of siblings at the new location and assign next value
    siblings_cursor = await db.equipment_nodes.find(
        {"parent_id": move_request.new_parent_id, "id": {"$ne": node_id}},
        {"sort_order": 1}
    ).to_list(1000)
    
    max_sort_order = -1
    for s in siblings_cursor:
        if s.get("sort_order") is not None and s.get("sort_order") > max_sort_order:
            max_sort_order = s.get("sort_order")
    
    new_sort_order = max_sort_order + 1
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "parent_id": move_request.new_parent_id,
            "sort_order": new_sort_order,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate cache after mutation
    invalidate_equipment_cache(current_user["id"])
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated
