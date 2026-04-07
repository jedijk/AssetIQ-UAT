"""
Equipment Search and Utility operations.
"""
from fastapi import APIRouter, Depends
from database import db
from auth import get_current_user
from iso14224_models import (
    ISOLevel, ISO_LEVEL_ORDER, CRITICALITY_PROFILES, Discipline,
    get_valid_parent_level, get_valid_child_levels, ISO_LEVEL_LABELS
)

router = APIRouter()


@router.get("/equipment-hierarchy/disciplines")
async def get_disciplines():
    """Get all disciplines."""
    return {"disciplines": [d.value for d in Discipline]}


@router.get("/equipment-hierarchy/search")
async def search_equipment(
    q: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Search equipment hierarchy by name."""
    if not q or len(q) < 2:
        return {"results": []}
    
    # Get user's role and assigned installations
    user_role = current_user.get("role", "viewer")
    assigned = current_user.get("assigned_installations", [])
    
    # Owners and admins can see ALL equipment - no filtering needed
    is_admin_or_owner = user_role in ["owner", "admin"]
    
    # First, do the name search
    search_filter = {
        "name": {"$regex": q, "$options": "i"}
    }
    
    # Search equipment nodes
    nodes = await db.equipment_nodes.find(
        search_filter,
        {"_id": 0, "id": 1, "name": 1, "level": 1, "parent_id": 1, "full_path": 1, "installation_id": 1}
    ).limit(limit if is_admin_or_owner else limit * 3).to_list(limit if is_admin_or_owner else limit * 3)
    
    # If user is NOT admin/owner and has assigned installations, filter results by hierarchy
    if not is_admin_or_owner and assigned:
        # Get IDs of assigned installations
        installations = await db.equipment_nodes.find(
            {"level": "installation", "name": {"$in": assigned}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
        installation_ids = {i["id"] for i in installations}
        
        # Filter nodes that belong to assigned installations
        filtered_nodes = []
        for node in nodes:
            # Check if node is an installation itself
            if node.get("level") == "installation" and node.get("id") in installation_ids:
                filtered_nodes.append(node)
                continue
            
            # Check if node has installation_id
            if node.get("installation_id") in installation_ids:
                filtered_nodes.append(node)
                continue
            
            # Trace parent chain to find if it belongs to an assigned installation
            current = node
            depth = 0
            belongs_to_assigned = False
            while current.get("parent_id") and depth < 15:
                parent = await db.equipment_nodes.find_one(
                    {"id": current["parent_id"]},
                    {"_id": 0, "id": 1, "name": 1, "parent_id": 1, "level": 1}
                )
                if parent:
                    if parent.get("level") == "installation" and parent.get("id") in installation_ids:
                        belongs_to_assigned = True
                        break
                    current = parent
                else:
                    break
                depth += 1
            
            if belongs_to_assigned:
                filtered_nodes.append(node)
        
        nodes = filtered_nodes[:limit]
    else:
        nodes = nodes[:limit]
    
    # Build path for nodes without full_path
    for node in nodes:
        if not node.get("full_path") and not node.get("path"):
            # Build path from parent chain
            path_parts = [node["name"]]
            current = node
            depth = 0
            while current.get("parent_id") and depth < 10:
                parent = await db.equipment_nodes.find_one(
                    {"id": current["parent_id"]},
                    {"_id": 0, "name": 1, "parent_id": 1}
                )
                if parent:
                    path_parts.insert(0, parent["name"])
                    current = parent
                else:
                    break
                depth += 1
            node["path"] = " > ".join(path_parts)
        elif node.get("full_path"):
            node["path"] = node["full_path"]
    
    return {"results": nodes}


@router.get("/equipment-hierarchy/criticality-profiles")
async def get_criticality_profiles():
    """Get all criticality profiles."""
    return {"profiles": CRITICALITY_PROFILES}


@router.get("/equipment-hierarchy/iso-levels")
async def get_iso_levels():
    """Get ISO 14224 hierarchy levels with labels."""
    return {
        "levels": [level.value for level in ISO_LEVEL_ORDER],
        "labels": {level.value: ISO_LEVEL_LABELS.get(level, level.value) for level in ISO_LEVEL_ORDER},
        "hierarchy": {
            level.value: {
                "label": ISO_LEVEL_LABELS.get(level, level.value),
                "parent": get_valid_parent_level(level).value if get_valid_parent_level(level) else None,
                "children": [c.value for c in get_valid_child_levels(level)]
            }
            for level in ISO_LEVEL_ORDER
        }
    }
