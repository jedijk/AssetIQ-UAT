"""Equipment node hierarchy operations — change level, reorder, move."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel

from database import db
from iso14224_models import (
    ISOLevel,
    ISO_LEVEL_ORDER,
    MoveNodeRequest,
    get_valid_child_levels,
    is_valid_parent_child,
    normalize_level,
)
from services.cache_service import invalidate_equipment_related
from services.tenant_schema import merge_tenant_filter


class ChangeLevelRequest(BaseModel):
    new_level: ISOLevel
    new_parent_id: Optional[str] = None


class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"


class ReorderToPositionRequest(BaseModel):
    target_node_id: str
    position: str  # "before" or "after"
    new_parent_id: Optional[str] = None


def _invalidate_equipment_cache(user_id: str = None, node_id: str = None, node_name: str = None):
    invalidate_equipment_related(
        equipment_id=node_id,
        equipment_name=node_name,
        user_id=user_id,
        reason="equipment_operations_mutation",
    )


async def _find_node(user: dict, node_id: str) -> dict:
    node = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    return node


async def change_node_level(user: dict, node_id: str, request: ChangeLevelRequest) -> dict:
    node = await _find_node(user, node_id)

    current_level = normalize_level(ISOLevel(node["level"]))
    new_level = normalize_level(request.new_level)

    current_idx = ISO_LEVEL_ORDER.index(current_level)
    new_idx = ISO_LEVEL_ORDER.index(new_level)

    if new_idx == current_idx:
        raise HTTPException(status_code=400, detail="Node is already at this level")

    is_promoting = new_idx < current_idx

    current_parent = None
    if node.get("parent_id"):
        current_parent = await db.equipment_nodes.find_one(
            merge_tenant_filter({"id": node["parent_id"]}, user),
        )

    if is_promoting:
        if not current_parent:
            raise HTTPException(status_code=400, detail="Cannot promote a root node")

        new_parent_id = current_parent.get("parent_id")

        if new_parent_id:
            grandparent = await db.equipment_nodes.find_one(
                merge_tenant_filter({"id": new_parent_id}, user),
            )
            if grandparent:
                grandparent_level = normalize_level(ISOLevel(grandparent["level"]))
                if not is_valid_parent_child(grandparent_level, new_level):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot promote to {new_level.value}. Invalid parent-child relationship.",
                    )
        elif new_level != ISOLevel.INSTALLATION:
            raise HTTPException(status_code=400, detail="Only installations can be root nodes")
    else:
        if not request.new_parent_id:
            raise HTTPException(status_code=400, detail="Must specify new_parent_id when demoting")

        new_parent = await db.equipment_nodes.find_one(
            merge_tenant_filter({"id": request.new_parent_id}, user),
        )
        if not new_parent:
            raise HTTPException(status_code=400, detail="New parent node not found")

        parent_level = normalize_level(ISOLevel(new_parent["level"]))
        if not is_valid_parent_child(parent_level, new_level):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot demote to {new_level.value} under {parent_level.value}",
            )

        new_parent_id = request.new_parent_id

    existing = await db.equipment_nodes.find_one(
        merge_tenant_filter({
            "name": node["name"],
            "parent_id": new_parent_id,
            "id": {"$ne": node_id},
        }, user),
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A node with name '{node['name']}' already exists at the target location",
        )

    siblings_cursor = await db.equipment_nodes.find(
        merge_tenant_filter({"parent_id": new_parent_id, "id": {"$ne": node_id}}, user),
        {"sort_order": 1},
    ).to_list(1000)

    max_sort_order = -1
    for s in siblings_cursor:
        if s.get("sort_order") is not None and s.get("sort_order") > max_sort_order:
            max_sort_order = s.get("sort_order")

    new_sort_order = max_sort_order + 1

    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": node_id}, user),
        {"$set": {
            "level": new_level.value,
            "parent_id": new_parent_id,
            "sort_order": new_sort_order,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    _invalidate_equipment_cache(user["id"])

    updated = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
        {"_id": 0},
    )
    action = "promoted" if is_promoting else "demoted"
    return {"message": f"Node {action} to {new_level.value}", "node": updated}


async def reorder_equipment_node(user: dict, node_id: str, request: ReorderRequest) -> dict:
    if request.direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")

    node = await _find_node(user, node_id)

    siblings_cursor = await db.equipment_nodes.find(
        merge_tenant_filter({"parent_id": node["parent_id"]}, user),
        {"_id": 0},
    ).to_list(1000)

    siblings = sorted(siblings_cursor, key=lambda x: (
        0 if x.get("sort_order") is not None else 1,
        x.get("sort_order") if x.get("sort_order") is not None else 0,
        x.get("name", ""),
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

    target_node = siblings[target_idx]

    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": node_id}, user),
        {"$set": {"sort_order": target_idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": target_node["id"]}, user),
        {"$set": {"sort_order": current_idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    _invalidate_equipment_cache(user["id"])
    return {"message": f"Node moved {request.direction}", "new_sort_order": target_idx}


async def reorder_node_to_position(
    user: dict,
    node_id: str,
    request: ReorderToPositionRequest,
) -> dict:
    if request.position not in ["before", "after"]:
        raise HTTPException(status_code=400, detail="Position must be 'before' or 'after'")

    node = await _find_node(user, node_id)

    target = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": request.target_node_id}, user),
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target node not found")

    new_parent_id = request.new_parent_id if request.new_parent_id is not None else target.get("parent_id")

    if new_parent_id != node.get("parent_id"):
        if new_parent_id:
            new_parent = await db.equipment_nodes.find_one(
                merge_tenant_filter({"id": new_parent_id}, user),
            )
            if not new_parent:
                raise HTTPException(status_code=400, detail="New parent not found")

            parent_level = ISOLevel(new_parent["level"])
            child_level = ISOLevel(node["level"])
            if not is_valid_parent_child(parent_level, child_level):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot place {child_level.value} under {parent_level.value}",
                )
        elif node["level"] != "installation":
            raise HTTPException(status_code=400, detail="Only installations can be at root level")

    siblings_cursor = await db.equipment_nodes.find(
        merge_tenant_filter({"parent_id": new_parent_id}, user),
        {"_id": 0},
    ).to_list(1000)

    siblings = [s for s in siblings_cursor if s["id"] != node_id]
    siblings.sort(key=lambda x: (
        0 if x.get("sort_order") is not None else 1,
        x.get("sort_order") if x.get("sort_order") is not None else 0,
        x.get("name", ""),
    ))

    target_idx = next((i for i, s in enumerate(siblings) if s["id"] == request.target_node_id), -1)

    if target_idx == -1:
        insert_idx = len(siblings)
    elif request.position == "before":
        insert_idx = target_idx
    else:
        insert_idx = target_idx + 1

    for i, sibling in enumerate(siblings):
        new_sort = i if i < insert_idx else i + 1
        await db.equipment_nodes.update_one(
            merge_tenant_filter({"id": sibling["id"]}, user),
            {"$set": {"sort_order": new_sort, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )

    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": node_id}, user),
        {"$set": {
            "sort_order": insert_idx,
            "parent_id": new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    _invalidate_equipment_cache(user["id"])

    updated = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
        {"_id": 0},
    )
    return {"message": f"Node moved {request.position} target", "node": updated}


async def move_equipment_node(user: dict, node_id: str, move_request: MoveNodeRequest) -> dict:
    node = await _find_node(user, node_id)

    new_parent = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": move_request.new_parent_id}, user),
    )
    if not new_parent:
        raise HTTPException(status_code=400, detail="New parent node not found")

    existing = await db.equipment_nodes.find_one(
        merge_tenant_filter({
            "name": node["name"],
            "parent_id": move_request.new_parent_id,
            "id": {"$ne": node_id},
        }, user),
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A node with name '{node['name']}' already exists under the target parent",
        )

    parent_level = ISOLevel(new_parent["level"])
    child_level = ISOLevel(node["level"])

    if not is_valid_parent_child(parent_level, child_level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot move {child_level.value} under {parent_level.value}. "
                f"Valid children: {[c.value for c in valid_children]}"
            ),
        )

    siblings_cursor = await db.equipment_nodes.find(
        merge_tenant_filter(
            {"parent_id": move_request.new_parent_id, "id": {"$ne": node_id}},
            user,
        ),
        {"sort_order": 1},
    ).to_list(1000)

    max_sort_order = -1
    for s in siblings_cursor:
        if s.get("sort_order") is not None and s.get("sort_order") > max_sort_order:
            max_sort_order = s.get("sort_order")

    new_sort_order = max_sort_order + 1

    await db.equipment_nodes.update_one(
        merge_tenant_filter({"id": node_id}, user),
        {"$set": {
            "parent_id": move_request.new_parent_id,
            "sort_order": new_sort_order,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    _invalidate_equipment_cache(user["id"])

    return await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": node_id}, user),
        {"_id": 0},
    )
