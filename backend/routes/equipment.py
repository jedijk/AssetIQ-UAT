"""
Equipment Hierarchy routes.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import json
import logging
import base64
import io
from database import db, efm_service, EMERGENT_LLM_KEY
from auth import get_current_user
from services.threat_score_service import recalculate_threat_scores_for_asset
from iso14224_models import (
    ISOLevel, ISO_LEVEL_ORDER, EQUIPMENT_TYPES, CRITICALITY_PROFILES, Discipline,
    get_valid_parent_level, get_valid_child_levels, is_valid_parent_child, normalize_level,
    EquipmentNodeCreate, EquipmentNodeUpdate, CriticalityAssignment, MoveNodeRequest,
    UnstructuredItemCreate, ParseEquipmentListRequest, AssignToHierarchyRequest,
    detect_equipment_type, EquipmentTypeCreate, EquipmentTypeUpdate, ISO_LEVEL_LABELS
)
from emergentintegrations.llm.chat import LlmChat, UserMessage
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Equipment Hierarchy"])

# ============= ISO 14224 EQUIPMENT HIERARCHY ENDPOINTS =============

@router.get("/equipment-hierarchy/types")
async def get_iso_equipment_types(
    current_user: dict = Depends(get_current_user)
):
    """Get all equipment types - merged from defaults and user-custom types."""
    # Get user's custom equipment types
    custom_types = await db.custom_equipment_types.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Merge: custom types override defaults by ID
    custom_ids = {t["id"] for t in custom_types}
    merged_types = [t for t in EQUIPMENT_TYPES if t["id"] not in custom_ids] + custom_types
    
    return {"equipment_types": merged_types}

@router.post("/equipment-hierarchy/types")
async def create_equipment_type(
    type_data: EquipmentTypeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a custom equipment type."""
    # Check if ID already exists for this user
    existing = await db.custom_equipment_types.find_one(
        {"id": type_data.id, "created_by": current_user["id"]}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Equipment type ID already exists")
    
    type_doc = {
        "id": type_data.id,
        "name": type_data.name,
        "iso_class": type_data.iso_class,
        "discipline": type_data.discipline,
        "icon": type_data.icon,
        "is_custom": True,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.custom_equipment_types.insert_one(type_doc)
    type_doc.pop("_id", None)
    return type_doc

@router.patch("/equipment-hierarchy/types/{type_id}")
async def update_equipment_type(
    type_id: str,
    update: EquipmentTypeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a custom equipment type."""
    # Check if it's a custom type
    existing = await db.custom_equipment_types.find_one(
        {"id": type_id, "created_by": current_user["id"]}
    )
    
    if not existing:
        # It might be a default type - create a custom override
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if not default_type:
            raise HTTPException(status_code=404, detail="Equipment type not found")
        
        # Create custom override
        type_doc = {
            **default_type,
            "is_custom": True,
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        update_data = {k: v for k, v in update.model_dump().items() if v is not None}
        type_doc.update(update_data)
        
        await db.custom_equipment_types.insert_one(type_doc)
        type_doc.pop("_id", None)
        return type_doc
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.custom_equipment_types.update_one(
            {"id": type_id, "created_by": current_user["id"]},
            {"$set": update_data}
        )
    
    updated = await db.custom_equipment_types.find_one(
        {"id": type_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    return updated

@router.delete("/equipment-hierarchy/types/{type_id}")
async def delete_equipment_type(
    type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom equipment type."""
    result = await db.custom_equipment_types.delete_one(
        {"id": type_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        # Check if it's a default type
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if default_type:
            raise HTTPException(status_code=400, detail="Cannot delete default equipment types")
        raise HTTPException(status_code=404, detail="Equipment type not found")
    return {"message": "Equipment type deleted"}

@router.get("/equipment-hierarchy/disciplines")
async def get_disciplines():
    """Get all disciplines."""
    return {"disciplines": [d.value for d in Discipline]}

@router.get("/equipment-hierarchy/criticality-profiles")
async def get_criticality_profiles():
    """Get all criticality profiles."""
    return {"profiles": CRITICALITY_PROFILES}

@router.get("/equipment-hierarchy/iso-levels")
async def get_iso_levels():
    """Get ISO 14224 hierarchy levels with labels."""
    from iso14224_models import ISO_LEVEL_LABELS
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

@router.get("/equipment-hierarchy/nodes")
async def get_equipment_nodes(
    current_user: dict = Depends(get_current_user)
):
    """Get all equipment hierarchy nodes for the current user, sorted by sort_order."""
    nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    return {"nodes": nodes}


@router.get("/equipment-hierarchy/export")
async def export_equipment_hierarchy_excel(
    current_user: dict = Depends(get_current_user)
):
    """Export equipment hierarchy to an Excel file."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    
    # Fetch all nodes
    nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(5000)
    
    # Fetch equipment types for lookup
    equipment_types = await db.custom_equipment_types.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Merge with defaults
    all_types = {t["id"]: t["name"] for t in EQUIPMENT_TYPES}
    for t in equipment_types:
        all_types[t["id"]] = t["name"]
    
    # Build parent lookup for path generation
    node_lookup = {n["id"]: n for n in nodes}
    
    def get_path(node):
        """Generate full path from root to node."""
        if not isinstance(node, dict):
            return ""
        path_parts = [node.get("name", "")]
        current = node
        while isinstance(current, dict) and current.get("parent_id") and current["parent_id"] in node_lookup:
            current = node_lookup[current["parent_id"]]
            if isinstance(current, dict):
                path_parts.insert(0, current.get("name", ""))
            else:
                break
        return " > ".join(path_parts)
    
    def get_criticality_score(node):
        """Calculate total criticality score."""
        if not isinstance(node, dict):
            return 0
        crit = node.get("criticality")
        if not isinstance(crit, dict):
            return 0
        return sum([
            crit.get("safety", 0) or 0,
            crit.get("production", 0) or 0,
            crit.get("environmental", 0) or 0,
            crit.get("reputation", 0) or 0
        ])
    
    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Equipment Hierarchy"
    
    # Define headers
    headers = [
        "ID", "Name", "Level", "Parent", "Full Path", "Equipment Type",
        "Discipline", "Process Step", "Description",
        "Safety", "Production", "Environmental", "Reputation", "Total Criticality",
        "Created At"
    ]
    
    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")  # Green
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Level colors for visual hierarchy
    level_colors = {
        "installation": "E8F5E9",
        "plant_unit": "C8E6C9",
        "section_system": "A5D6A7",
        "equipment_unit": "81C784",
        "equipment": "66BB6A",
        "subunit": "4CAF50",
        "maintainable_item": "43A047"
    }
    
    # Write headers
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border
    
    # Write data rows
    for row_idx, node in enumerate(nodes, 2):
        # Skip corrupted nodes that are not dictionaries
        if not isinstance(node, dict):
            logger.warning(f"Skipping corrupted node at row {row_idx}: expected dict, got {type(node).__name__}")
            continue
            
        parent_name = ""
        if node.get("parent_id") and node["parent_id"] in node_lookup:
            parent_node = node_lookup[node["parent_id"]]
            if isinstance(parent_node, dict):
                parent_name = parent_node.get("name", "")
        
        equipment_type_name = ""
        if node.get("equipment_type_id"):
            equipment_type_name = all_types.get(node["equipment_type_id"], "")
        
        # Handle criticality - ensure it's a dict
        criticality = node.get("criticality")
        if not isinstance(criticality, dict):
            criticality = {}
        
        # Safely get level label
        level_label = ""
        node_level = node.get("level")
        if node_level:
            try:
                level_label = ISO_LEVEL_LABELS.get(ISOLevel(node_level), str(node_level))
            except (ValueError, TypeError):
                level_label = str(node_level)
        
        row_data = [
            node.get("id", ""),
            node.get("name", ""),
            level_label,
            parent_name,
            get_path(node),
            equipment_type_name,
            (node.get("discipline") or "").replace("_", " ").title(),
            node.get("process_step", ""),
            node.get("description", ""),
            criticality.get("safety", 0),
            criticality.get("production", 0),
            criticality.get("environmental", 0),
            criticality.get("reputation", 0),
            get_criticality_score(node),
            node.get("created_at", "")[:10] if node.get("created_at") else ""
        ]
        
        # Apply level-based coloring
        level_color = level_colors.get(node.get("level"), "FFFFFF")
        row_fill = PatternFill(start_color=level_color, end_color=level_color, fill_type="solid")
        
        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            # Apply level coloring to first 3 columns
            if col <= 3:
                cell.fill = row_fill
    
    # Adjust column widths
    column_widths = [38, 25, 18, 20, 50, 20, 15, 20, 30, 8, 10, 12, 10, 14, 12]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width
    
    # Freeze header row
    ws.freeze_panes = "A2"
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"equipment_hierarchy_{timestamp}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/equipment-hierarchy/nodes/{node_id}")
async def get_equipment_node(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    return node

@router.post("/equipment-hierarchy/nodes")
async def create_equipment_node(
    node_data: EquipmentNodeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new equipment hierarchy node with ISO 14224 validation."""
    # Check for duplicate name under the same parent
    existing = await db.equipment_nodes.find_one({
        "name": node_data.name,
        "parent_id": node_data.parent_id,
        "created_by": current_user["id"]
    })
    if existing:
        parent_info = f"under parent '{node_data.parent_id}'" if node_data.parent_id else "at root level"
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node_data.name}' already exists {parent_info}"
        )
    
    # Validate parent-child relationship if parent specified
    if node_data.parent_id:
        parent = await db.equipment_nodes.find_one(
            {"id": node_data.parent_id, "created_by": current_user["id"]},
            {"_id": 0}
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent node not found")
        
        parent_level = ISOLevel(parent["level"])
        if not is_valid_parent_child(parent_level, node_data.level):
            valid_children = get_valid_child_levels(parent_level)
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid parent-child relationship. {parent_level.value} can only have {[c.value for c in valid_children]} as children"
            )
    else:
        # Root nodes must be installations
        if node_data.level != ISOLevel.INSTALLATION:
            raise HTTPException(
                status_code=400, 
                detail="Root nodes must be of level 'installation'"
            )
    
    node_id = str(uuid.uuid4())
    
    # Calculate sort_order - get max sort_order for siblings and add 1
    max_sort = await db.equipment_nodes.find_one(
        {"parent_id": node_data.parent_id, "created_by": current_user["id"]},
        sort=[("sort_order", -1)],
        projection={"sort_order": 1}
    )
    next_sort_order = (max_sort.get("sort_order", 0) if max_sort else 0) + 1
    
    # Inherit process_step from parent if not provided and at subunit/maintainable_item level
    inherited_process_step = node_data.process_step
    if not inherited_process_step and node_data.parent_id and node_data.level in [ISOLevel.SUBUNIT, ISOLevel.MAINTAINABLE_ITEM]:
        parent = await db.equipment_nodes.find_one(
            {"id": node_data.parent_id, "created_by": current_user["id"]},
            {"process_step": 1}
        )
        if parent and parent.get("process_step"):
            inherited_process_step = parent["process_step"]
    
    node_doc = {
        "id": node_id,
        "name": node_data.name,
        "level": node_data.level.value,
        "parent_id": node_data.parent_id,
        "equipment_type_id": node_data.equipment_type_id,
        "description": node_data.description,
        "process_step": inherited_process_step,
        "criticality": None,
        "discipline": None,
        "sort_order": next_sort_order,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(node_doc)
    
    # Auto-generate EFMs if equipment_type_id is specified
    if node_data.equipment_type_id:
        try:
            efms = await efm_service.generate_efms_for_equipment(
                equipment_id=node_id,
                equipment_name=node_data.name,
                equipment_type_id=node_data.equipment_type_id
            )
            node_doc["efms_generated"] = len(efms)
            logger.info(f"Auto-generated {len(efms)} EFMs for equipment {node_id}")
        except Exception as e:
            logger.error(f"Failed to generate EFMs for {node_id}: {e}")
    
    # Remove MongoDB's _id before returning
    node_doc.pop("_id", None)
    return node_doc

@router.patch("/equipment-hierarchy/nodes/{node_id}")
async def update_equipment_node(
    node_id: str,
    update: EquipmentNodeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an equipment hierarchy node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Validate new parent if changing parent
    if update.parent_id is not None and update.parent_id != node.get("parent_id"):
        if update.parent_id:
            new_parent = await db.equipment_nodes.find_one(
                {"id": update.parent_id, "created_by": current_user["id"]},
                {"_id": 0}
            )
            if not new_parent:
                raise HTTPException(status_code=400, detail="New parent node not found")
            
            parent_level = ISOLevel(new_parent["level"])
            child_level = ISOLevel(node["level"])
            if not is_valid_parent_child(parent_level, child_level):
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid parent-child relationship per ISO 14224"
                )
            
            # Check for circular references
            current_parent = update.parent_id
            while current_parent:
                if current_parent == node_id:
                    raise HTTPException(status_code=400, detail="Circular reference detected")
                parent_node = await db.equipment_nodes.find_one({"id": current_parent})
                current_parent = parent_node.get("parent_id") if parent_node else None
        else:
            # Removing parent - node must be installation level
            if node["level"] != ISOLevel.INSTALLATION.value:
                raise HTTPException(
                    status_code=400, 
                    detail="Only installations can be root nodes"
                )
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.equipment_nodes.update_one(
            {"id": node_id},
            {"$set": update_data}
        )
        
        # Sync EFMs if equipment_type_id changed
        if update.equipment_type_id is not None:
            old_type = node.get("equipment_type_id")
            new_type = update.equipment_type_id
            if old_type != new_type:
                try:
                    sync_result = await efm_service.sync_efms_for_equipment(
                        equipment_id=node_id,
                        equipment_name=node.get("name"),
                        new_equipment_type_id=new_type,
                        old_equipment_type_id=old_type
                    )
                    logger.info(f"Synced EFMs for {node_id}: {sync_result}")
                except Exception as e:
                    logger.error(f"Failed to sync EFMs for {node_id}: {e}")
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated

@router.delete("/equipment-hierarchy/nodes/{node_id}")
async def delete_equipment_node(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an equipment node and optionally its children."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Get all children recursively
    async def get_children_ids(parent_id):
        children = await db.equipment_nodes.find(
            {"parent_id": parent_id, "created_by": current_user["id"]},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        all_ids = [c["id"] for c in children]
        for child in children:
            all_ids.extend(await get_children_ids(child["id"]))
        return all_ids
    
    children_ids = await get_children_ids(node_id)
    all_ids = [node_id] + children_ids
    
    result = await db.equipment_nodes.delete_many(
        {"id": {"$in": all_ids}, "created_by": current_user["id"]}
    )
    
    return {"message": f"Deleted {result.deleted_count} nodes", "deleted_ids": all_ids}


class ChangeLevelRequest(BaseModel):
    new_level: ISOLevel
    new_parent_id: Optional[str] = None  # Required when demoting, optional when promoting


@router.post("/equipment-hierarchy/nodes/{node_id}/change-level")
async def change_node_level(
    node_id: str,
    request: ChangeLevelRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change the hierarchy level of a node (promote or demote)."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    current_level = normalize_level(ISOLevel(node["level"]))
    new_level = normalize_level(request.new_level)
    
    current_idx = ISO_LEVEL_ORDER.index(current_level)
    new_idx = ISO_LEVEL_ORDER.index(new_level)
    
    # Validate level change
    if new_idx == current_idx:
        raise HTTPException(status_code=400, detail="Node is already at this level")
    
    is_promoting = new_idx < current_idx  # Moving up in hierarchy
    is_demoting = new_idx > current_idx   # Moving down in hierarchy
    
    # Get current parent
    current_parent = None
    if node.get("parent_id"):
        current_parent = await db.equipment_nodes.find_one(
            {"id": node["parent_id"], "created_by": current_user["id"]}
        )
    
    if is_promoting:
        # When promoting, the node becomes a sibling of its current parent
        # The new parent is the grandparent (parent of current parent)
        if not current_parent:
            raise HTTPException(status_code=400, detail="Cannot promote a root node")
        
        new_parent_id = current_parent.get("parent_id")  # Grandparent (can be None for installation)
        
        # Validate the new level is correct for the new parent
        if new_parent_id:
            grandparent = await db.equipment_nodes.find_one(
                {"id": new_parent_id, "created_by": current_user["id"]}
            )
            if grandparent:
                grandparent_level = normalize_level(ISOLevel(grandparent["level"]))
                if not is_valid_parent_child(grandparent_level, new_level):
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Cannot promote to {new_level.value}. Invalid parent-child relationship."
                    )
        else:
            # Promoting to root level - must be installation
            if new_level != ISOLevel.INSTALLATION:
                raise HTTPException(status_code=400, detail="Only installations can be root nodes")
        
    else:  # is_demoting
        # When demoting, user must specify a new parent
        if not request.new_parent_id:
            raise HTTPException(status_code=400, detail="Must specify new_parent_id when demoting")
        
        new_parent = await db.equipment_nodes.find_one(
            {"id": request.new_parent_id, "created_by": current_user["id"]}
        )
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
        "created_by": current_user["id"],
        "id": {"$ne": node_id}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node['name']}' already exists at the target location"
        )
    
    # Update the node
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "level": new_level.value,
            "parent_id": new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If promoting, also need to update children's parent to maintain hierarchy
    # Children of this node stay as children
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    action = "promoted" if is_promoting else "demoted"
    return {
        "message": f"Node {action} to {new_level.value}",
        "node": updated
    }


class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"


@router.post("/equipment-hierarchy/nodes/{node_id}/reorder")
async def reorder_equipment_node(
    node_id: str,
    request: ReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node among its siblings (move up or down in the list)."""
    if request.direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    current_sort = node.get("sort_order", 0)
    
    # Get all siblings (same parent)
    siblings = await db.equipment_nodes.find(
        {"parent_id": node["parent_id"], "created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    
    if len(siblings) <= 1:
        raise HTTPException(status_code=400, detail="No siblings to reorder with")
    
    # Find current index
    current_idx = next((i for i, s in enumerate(siblings) if s["id"] == node_id), -1)
    if current_idx == -1:
        raise HTTPException(status_code=400, detail="Node not found in siblings")
    
    # Calculate target index
    if request.direction == "up":
        if current_idx == 0:
            raise HTTPException(status_code=400, detail="Already at the top")
        target_idx = current_idx - 1
    else:  # down
        if current_idx == len(siblings) - 1:
            raise HTTPException(status_code=400, detail="Already at the bottom")
        target_idx = current_idx + 1
    
    # Swap sort_order values
    target_node = siblings[target_idx]
    target_sort = target_node.get("sort_order", target_idx)
    
    # Update both nodes
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {"sort_order": target_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.equipment_nodes.update_one(
        {"id": target_node["id"]},
        {"$set": {"sort_order": current_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": f"Node moved {request.direction}", "new_sort_order": target_sort}


class ReorderToPositionRequest(BaseModel):
    target_node_id: str  # The node to position relative to
    position: str  # "before" or "after"
    new_parent_id: Optional[str] = None  # If moving to a different parent


@router.post("/equipment-hierarchy/nodes/{node_id}/reorder-to")
async def reorder_node_to_position(
    node_id: str,
    request: ReorderToPositionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node to a specific position relative to another node via drag-and-drop."""
    if request.position not in ["before", "after"]:
        raise HTTPException(status_code=400, detail="Position must be 'before' or 'after'")
    
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    target = await db.equipment_nodes.find_one(
        {"id": request.target_node_id, "created_by": current_user["id"]}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target node not found")
    
    # Determine the new parent - use target's parent if not specified
    new_parent_id = request.new_parent_id if request.new_parent_id is not None else target.get("parent_id")
    
    # If moving to a different parent, validate the level relationship
    if new_parent_id != node.get("parent_id"):
        if new_parent_id:
            new_parent = await db.equipment_nodes.find_one(
                {"id": new_parent_id, "created_by": current_user["id"]}
            )
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
            # Moving to root level - must be installation
            if node["level"] != "installation":
                raise HTTPException(status_code=400, detail="Only installations can be at root level")
    
    # Get all siblings at the target location (same parent as target)
    siblings = await db.equipment_nodes.find(
        {"parent_id": new_parent_id, "created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    
    # Remove the dragged node from siblings if it's in the same parent
    siblings = [s for s in siblings if s["id"] != node_id]
    
    # Find target's position
    target_idx = next((i for i, s in enumerate(siblings) if s["id"] == request.target_node_id), -1)
    
    if target_idx == -1:
        # Target not in siblings (was the dragged node itself), just append
        insert_idx = len(siblings)
    elif request.position == "before":
        insert_idx = target_idx
    else:  # after
        insert_idx = target_idx + 1
    
    # Reassign sort_order for all siblings
    for i, sibling in enumerate(siblings):
        new_sort = i if i < insert_idx else i + 1
        if sibling.get("sort_order", 0) != new_sort:
            await db.equipment_nodes.update_one(
                {"id": sibling["id"]},
                {"$set": {"sort_order": new_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    # Update the moved node with new sort_order and possibly new parent
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "sort_order": insert_idx,
            "parent_id": new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return {
        "message": f"Node moved {request.position} target",
        "node": updated
    }


@router.post("/equipment-hierarchy/nodes/{node_id}/move")
async def move_equipment_node(
    node_id: str,
    move_request: MoveNodeRequest,
    current_user: dict = Depends(get_current_user)
):
    """Move a node to a new parent with ISO 14224 validation."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    new_parent = await db.equipment_nodes.find_one(
        {"id": move_request.new_parent_id, "created_by": current_user["id"]}
    )
    if not new_parent:
        raise HTTPException(status_code=400, detail="New parent node not found")
    
    # Check for duplicate name under the new parent
    existing = await db.equipment_nodes.find_one({
        "name": node["name"],
        "parent_id": move_request.new_parent_id,
        "created_by": current_user["id"],
        "id": {"$ne": node_id}  # Exclude the node itself
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node['name']}' already exists under the target parent"
        )
    
    # Validate the move per ISO 14224
    parent_level = ISOLevel(new_parent["level"])
    child_level = ISOLevel(node["level"])
    
    if not is_valid_parent_child(parent_level, child_level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot move {child_level.value} under {parent_level.value}. Valid children: {[c.value for c in valid_children]}"
        )
    
    # Update the node
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "parent_id": move_request.new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated

@router.post("/equipment-hierarchy/nodes/{node_id}/criticality")
async def assign_criticality(
    node_id: str,
    assignment: CriticalityAssignment,
    current_user: dict = Depends(get_current_user)
):
    """Assign criticality to an equipment node using 4-dimension model (Safety, Production, Environmental, Reputation)."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Check if all 4 dimensions are None/0 - if so, clear criticality
    has_any_dimension = (
        (assignment.safety_impact and assignment.safety_impact > 0) or
        (assignment.production_impact and assignment.production_impact > 0) or
        (assignment.environmental_impact and assignment.environmental_impact > 0) or
        (assignment.reputation_impact and assignment.reputation_impact > 0)
    )
    
    if not has_any_dimension:
        await db.equipment_nodes.update_one(
            {"id": node_id},
            {"$set": {
                "criticality": None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
        return updated
    
    # Build 4-dimension criticality data
    safety = assignment.safety_impact or 0
    production = assignment.production_impact or 0
    environmental = assignment.environmental_impact or 0
    reputation = assignment.reputation_impact or 0
    
    # Calculate overall criticality level based on max dimension
    max_impact = max(safety, production, environmental, reputation)
    
    # Determine legacy level for backwards compatibility
    if safety >= 4 or max_impact == 5:
        level = "safety_critical"
        color = "#EF4444"  # Red
    elif production >= 4 or max_impact >= 4:
        level = "production_critical"
        color = "#F97316"  # Orange
    elif max_impact >= 3:
        level = "medium"
        color = "#EAB308"  # Yellow
    else:
        level = "low"
        color = "#22C55E"  # Green
    
    criticality_data = {
        # 4-dimension model
        "safety_impact": safety,
        "production_impact": production,
        "environmental_impact": environmental,
        "reputation_impact": reputation,
        # Derived values for backwards compatibility
        "level": level,
        "color": color,
        "max_impact": max_impact,
        # Legacy fields preserved
        "profile_id": assignment.profile_id,
        "fatality_risk": assignment.fatality_risk or 0,
        "production_loss_per_day": assignment.production_loss_per_day or 0,
        "failure_probability": assignment.failure_probability or 0,
        "downtime_days": assignment.downtime_days or 0,
    }
    
    # Calculate risk score weighted by dimensions
    risk_score = (
        (safety * 25) +  # Safety has highest weight
        (production * 20) +
        (environmental * 15) +
        (reputation * 10)
    )
    criticality_data["risk_score"] = round(risk_score, 2)
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "criticality": criticality_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Recalculate risk scores for all threats linked to this asset
    asset_name = node.get("name")
    updated_threats = 0
    if asset_name:
        updated_threats = await recalculate_threat_scores_for_asset(
            asset_name, 
            current_user["id"], 
            criticality_data,
            node_id  # Pass node_id to also find threats by linked_equipment_id
        )
        logger.info(f"Updated {updated_threats} threat scores after criticality change for {asset_name}")
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    # Include count of updated threats in response
    updated["threats_updated"] = updated_threats if asset_name else 0
    return updated

@router.post("/equipment-hierarchy/nodes/{node_id}/discipline")
async def assign_discipline(
    node_id: str,
    discipline: str,
    current_user: dict = Depends(get_current_user)
):
    """Assign discipline to an equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Validate discipline
    try:
        Discipline(discipline)  # Validate discipline enum
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid discipline. Valid options: {[d.value for d in Discipline]}"
        )
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "discipline": discipline,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated

@router.get("/equipment-hierarchy/stats")
async def get_hierarchy_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get statistics about the equipment hierarchy."""
    user_id = current_user["id"]
    
    total_nodes = await db.equipment_nodes.count_documents({"created_by": user_id})
    
    # Count by level
    level_counts = {}
    for level in ISO_LEVEL_ORDER:
        count = await db.equipment_nodes.count_documents(
            {"created_by": user_id, "level": level.value}
        )
        level_counts[level.value] = count
    
    # Count by criticality
    criticality_counts = {
        "safety_critical": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "safety_critical"}
        ),
        "production_critical": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "production_critical"}
        ),
        "medium": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "medium"}
        ),
        "low": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "low"}
        ),
        "unassigned": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality": None}
        )
    }
    
    return {
        "total_nodes": total_nodes,
        "by_level": level_counts,
        "by_criticality": criticality_counts
    }

# ============= EQUIPMENT FAILURE MODES (EFM) ENDPOINTS =============

@router.get("/equipment-hierarchy/unstructured")
async def get_unstructured_items(
    current_user: dict = Depends(get_current_user)
):
    """Get all unstructured (unassigned) equipment items."""
    items = await db.unstructured_items.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(1000)
    return {"items": items}

@router.post("/equipment-hierarchy/unstructured")
async def create_unstructured_item(
    item_data: UnstructuredItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a single unstructured equipment item."""
    # Detect equipment type if not provided
    detected = detect_equipment_type(item_data.name)
    
    item_id = str(uuid.uuid4())
    item_doc = {
        "id": item_id,
        "name": item_data.name,
        "detected_type_id": item_data.detected_type_id or (detected["id"] if detected else None),
        "detected_type_name": detected["name"] if detected else None,
        "detected_discipline": item_data.detected_discipline or (detected["discipline"] if detected else None),
        "detected_icon": detected["icon"] if detected else None,
        "source": item_data.source or "manual",
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.unstructured_items.insert_one(item_doc)
    item_doc.pop("_id", None)
    return item_doc

@router.post("/equipment-hierarchy/parse-list")
async def parse_equipment_list(
    request: ParseEquipmentListRequest,
    current_user: dict = Depends(get_current_user)
):
    """Parse a text list and create unstructured items with auto-detection."""
    import re
    
    content = request.content.strip()
    
    # Split by common delimiters: newlines, commas, semicolons, tabs
    items = re.split(r'[\n\r,;\t]+', content)
    
    # Clean and deduplicate
    seen = set()
    unique_items = []
    for item in items:
        cleaned = item.strip()
        # Remove common list prefixes like "1.", "- ", "• ", etc.
        cleaned = re.sub(r'^[\d]+[.\)]\s*', '', cleaned)
        cleaned = re.sub(r'^[-•*]\s*', '', cleaned)
        cleaned = cleaned.strip()
        
        if cleaned and len(cleaned) > 1 and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            unique_items.append(cleaned)
    
    # Create unstructured items
    created_items = []
    for name in unique_items:
        detected = detect_equipment_type(name)
        
        item_id = str(uuid.uuid4())
        item_doc = {
            "id": item_id,
            "name": name,
            "detected_type_id": detected["id"] if detected else None,
            "detected_type_name": detected["name"] if detected else None,
            "detected_discipline": detected["discipline"] if detected else None,
            "detected_icon": detected["icon"] if detected else None,
            "source": request.source,
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.unstructured_items.insert_one(item_doc)
        item_doc.pop("_id", None)
        created_items.append(item_doc)
    
    return {
        "parsed_count": len(created_items),
        "items": created_items
    }

@router.post("/equipment-hierarchy/parse-file")
async def parse_equipment_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Parse an uploaded file (Excel, PDF, CSV, TXT) and extract equipment items."""
    import io
    
    filename = file.filename.lower()
    content = await file.read()
    
    extracted_items = []
    
    try:
        if filename.endswith('.csv') or filename.endswith('.txt'):
            # Plain text or CSV
            text_content = content.decode('utf-8', errors='ignore')
            items = text_content.strip().split('\n')
            extracted_items = [item.strip() for item in items if item.strip()]
            
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            # Excel file
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content), header=None)
            # Get all non-empty cells from first column (or all columns)
            for col in df.columns:
                for val in df[col].dropna():
                    if isinstance(val, str) and val.strip():
                        extracted_items.append(val.strip())
                    elif not pd.isna(val):
                        extracted_items.append(str(val).strip())
                        
        elif filename.endswith('.pdf'):
            # PDF file - use PyPDF2 or pdfplumber
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            lines = text.split('\n')
                            extracted_items.extend([l.strip() for l in lines if l.strip()])
            except ImportError:
                # Fallback to PyPDF2
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(content))
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        lines = text.split('\n')
                        extracted_items.extend([l.strip() for l in lines if l.strip()])
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use .txt, .csv, .xlsx, .xls, or .pdf")
    
    except Exception as e:
        logger.error(f"File parsing error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
    
    # Clean and deduplicate
    import re
    seen = set()
    unique_items = []
    for item in extracted_items:
        cleaned = item.strip()
        cleaned = re.sub(r'^[\d]+[.\)]\s*', '', cleaned)
        cleaned = re.sub(r'^[-•*]\s*', '', cleaned)
        cleaned = cleaned.strip()
        
        if cleaned and len(cleaned) > 1 and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            unique_items.append(cleaned)
    
    # Create unstructured items
    created_items = []
    for name in unique_items[:100]:  # Limit to 100 items per file
        detected = detect_equipment_type(name)
        
        item_id = str(uuid.uuid4())
        item_doc = {
            "id": item_id,
            "name": name,
            "detected_type_id": detected["id"] if detected else None,
            "detected_type_name": detected["name"] if detected else None,
            "detected_discipline": detected["discipline"] if detected else None,
            "detected_icon": detected["icon"] if detected else None,
            "source": "file",
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.unstructured_items.insert_one(item_doc)
        item_doc.pop("_id", None)
        created_items.append(item_doc)
    
    return {
        "filename": file.filename,
        "parsed_count": len(created_items),
        "items": created_items
    }

@router.post("/equipment-hierarchy/unstructured/{item_id}/assign")
async def assign_unstructured_to_hierarchy(
    item_id: str,
    assignment: AssignToHierarchyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Move an unstructured item into the ISO hierarchy."""
    # Get the unstructured item
    item = await db.unstructured_items.find_one(
        {"id": item_id, "created_by": current_user["id"]}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Unstructured item not found")
    
    # Check for duplicate name under the same parent
    existing = await db.equipment_nodes.find_one({
        "name": item["name"],
        "parent_id": assignment.parent_id,
        "created_by": current_user["id"]
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{item['name']}' already exists under this parent"
        )
    
    # Validate parent exists
    parent = await db.equipment_nodes.find_one(
        {"id": assignment.parent_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not parent:
        raise HTTPException(status_code=400, detail="Parent node not found")
    
    # Validate ISO level relationship
    try:
        target_level = ISOLevel(assignment.level)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid ISO level: {assignment.level}")
    
    parent_level = ISOLevel(parent["level"])
    if not is_valid_parent_child(parent_level, target_level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add {target_level.value} under {parent_level.value}. Valid: {[c.value for c in valid_children]}"
        )
    
    # Create the equipment node
    node_id = str(uuid.uuid4())
    node_doc = {
        "id": node_id,
        "name": item["name"],
        "level": target_level.value,
        "parent_id": assignment.parent_id,
        "equipment_type_id": item.get("detected_type_id"),
        "description": f"Imported from unstructured list (source: {item.get('source', 'unknown')})",
        "criticality": None,
        "discipline": item.get("detected_discipline"),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(node_doc)
    node_doc.pop("_id", None)
    
    # Delete the unstructured item
    await db.unstructured_items.delete_one({"id": item_id})
    
    return node_doc

@router.delete("/equipment-hierarchy/unstructured/{item_id}")
async def delete_unstructured_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an unstructured item."""
    result = await db.unstructured_items.delete_one(
        {"id": item_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

@router.delete("/equipment-hierarchy/unstructured")
async def clear_unstructured_items(
    current_user: dict = Depends(get_current_user)
):
    """Delete all unstructured items for the current user."""
    result = await db.unstructured_items.delete_many(
        {"created_by": current_user["id"]}
    )
    return {"message": f"Deleted {result.deleted_count} items"}
