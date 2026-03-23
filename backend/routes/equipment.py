"""
Equipment Hierarchy Routes - ISO 14224 compliant equipment management
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from .deps import db, get_current_user, logger
from iso14224_models import (
    ISOLevel, ISO_LEVEL_ORDER, EQUIPMENT_TYPES, CRITICALITY_PROFILES, Discipline,
    get_valid_parent_level, get_valid_child_levels, is_valid_parent_child, normalize_level,
    ISO_LEVEL_LABELS
)

router = APIRouter(prefix="/equipment-hierarchy", tags=["Equipment Hierarchy"])


# ============= PYDANTIC MODELS =============

class EquipmentTypeCreate(BaseModel):
    id: str
    name: str
    iso_class: str
    discipline: str
    icon: Optional[str] = "Cog"


class EquipmentTypeUpdate(BaseModel):
    name: Optional[str] = None
    iso_class: Optional[str] = None
    discipline: Optional[str] = None
    icon: Optional[str] = None


class EquipmentNodeCreate(BaseModel):
    name: str
    level: ISOLevel
    parent_id: Optional[str] = None
    equipment_type_id: Optional[str] = None
    description: Optional[str] = None


class EquipmentNodeUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    equipment_type_id: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[str] = None


class CriticalityUpdate(BaseModel):
    safety_impact: Optional[int] = Field(None, ge=1, le=5)
    production_impact: Optional[int] = Field(None, ge=1, le=5)
    environmental_impact: Optional[int] = Field(None, ge=1, le=5)
    reputation_impact: Optional[int] = Field(None, ge=1, le=5)


class NodeReorderRequest(BaseModel):
    direction: str = Field(..., pattern="^(up|down)$")


class NodeReorderToRequest(BaseModel):
    target_id: str
    position: str = Field(..., pattern="^(before|after)$")


class NodeMoveRequest(BaseModel):
    new_parent_id: Optional[str] = None


class NodeLevelChangeRequest(BaseModel):
    new_level: ISOLevel
    force: bool = False


class UnstructuredItem(BaseModel):
    text: str
    source: Optional[str] = None


class ParseListRequest(BaseModel):
    items: List[str]


class AssignUnstructuredRequest(BaseModel):
    parent_id: str
    level: ISOLevel
    equipment_type_id: Optional[str] = None


# ============= HELPER FUNCTIONS =============

async def recalculate_threat_scores_for_asset(asset_name: str, user_id: str, new_criticality: dict = None, equipment_node_id: str = None):
    """Recalculate risk scores for all threats linked to a specific asset."""
    from failure_modes import FAILURE_MODES_LIBRARY
    
    query_conditions = [{"asset": asset_name, "created_by": user_id}]
    if equipment_node_id:
        query_conditions.append({"linked_equipment_id": equipment_node_id, "created_by": user_id})
    
    threats = await db.threats.find({"$or": query_conditions}).to_list(1000)
    
    if not threats:
        return 0
    
    if new_criticality:
        safety_impact = new_criticality.get("safety_impact", 0) or 0
        production_impact = new_criticality.get("production_impact", 0) or 0
        environmental_impact = new_criticality.get("environmental_impact", 0) or 0
        reputation_impact = new_criticality.get("reputation_impact", 0) or 0
        
        criticality_score = (
            (safety_impact * 25) + 
            (production_impact * 20) + 
            (environmental_impact * 15) + 
            (reputation_impact * 10)
        ) / 3.5
        criticality_score = min(100, int(criticality_score))
        
        max_impact = max(safety_impact, production_impact, environmental_impact, reputation_impact)
        if max_impact >= 5:
            criticality_level = "safety_critical"
        elif max_impact >= 4:
            criticality_level = "production_critical"
        elif max_impact >= 3:
            criticality_level = "medium"
        else:
            criticality_level = "low"
        
        criticality_data = {
            "safety_impact": safety_impact,
            "production_impact": production_impact,
            "environmental_impact": environmental_impact,
            "reputation_impact": reputation_impact,
            "level": criticality_level,
            "criticality_score": criticality_score
        }
    else:
        criticality_score = 0
        criticality_level = "low"
        criticality_data = None
    
    updated_count = 0
    for threat in threats:
        fmea_score = threat.get("fmea_score", threat.get("base_risk_score", 50))
        
        failure_mode_name = threat.get("failure_mode")
        if failure_mode_name and failure_mode_name != "Unknown":
            for fm in FAILURE_MODES_LIBRARY:
                if fm["failure_mode"].lower() == failure_mode_name.lower():
                    fmea_score = min(100, int(fm["rpn"] / 10))
                    break
        
        final_risk_score = int((criticality_score * 0.75) + (fmea_score * 0.25))
        final_risk_score = min(100, max(0, final_risk_score))
        
        if final_risk_score >= 70:
            risk_level = "Critical"
        elif final_risk_score >= 50:
            risk_level = "High"
        elif final_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        update_data = {
            "risk_score": final_risk_score,
            "criticality_score": criticality_score,
            "fmea_score": fmea_score,
            "base_risk_score": fmea_score,
            "risk_level": risk_level,
            "equipment_criticality": criticality_level,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if criticality_data:
            update_data["equipment_criticality_data"] = criticality_data
        
        await db.threats.update_one({"id": threat["id"]}, {"$set": update_data})
        updated_count += 1
    
    return updated_count


# ============= EQUIPMENT TYPES ROUTES =============

@router.get("/types")
async def get_iso_equipment_types(current_user: dict = Depends(get_current_user)):
    """Get all equipment types - merged from defaults and user-custom types."""
    custom_types = await db.custom_equipment_types.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    custom_ids = {t["id"] for t in custom_types}
    merged_types = [t for t in EQUIPMENT_TYPES if t["id"] not in custom_ids] + custom_types
    
    return {"equipment_types": merged_types}


@router.post("/types")
async def create_equipment_type(
    type_data: EquipmentTypeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a custom equipment type."""
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


@router.patch("/types/{type_id}")
async def update_equipment_type(
    type_id: str,
    update: EquipmentTypeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a custom equipment type."""
    existing = await db.custom_equipment_types.find_one(
        {"id": type_id, "created_by": current_user["id"]}
    )
    
    if not existing:
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if not default_type:
            raise HTTPException(status_code=404, detail="Equipment type not found")
        
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


@router.delete("/types/{type_id}")
async def delete_equipment_type(
    type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom equipment type."""
    result = await db.custom_equipment_types.delete_one(
        {"id": type_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if default_type:
            raise HTTPException(status_code=400, detail="Cannot delete default equipment types")
        raise HTTPException(status_code=404, detail="Equipment type not found")
    return {"message": "Equipment type deleted"}


# ============= REFERENCE DATA ROUTES =============

@router.get("/disciplines")
async def get_disciplines():
    """Get all disciplines."""
    return {"disciplines": [d.value for d in Discipline]}


@router.get("/criticality-profiles")
async def get_criticality_profiles():
    """Get all criticality profiles."""
    return {"profiles": CRITICALITY_PROFILES}


@router.get("/iso-levels")
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


# ============= EQUIPMENT NODES ROUTES =============

@router.get("/nodes")
async def get_equipment_nodes(current_user: dict = Depends(get_current_user)):
    """Get all equipment hierarchy nodes for the current user."""
    nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    return {"nodes": nodes}


@router.get("/nodes/{node_id}")
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


@router.post("/nodes")
async def create_equipment_node(
    node_data: EquipmentNodeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new equipment hierarchy node with ISO 14224 validation."""
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
        if node_data.level != ISOLevel.INSTALLATION:
            raise HTTPException(status_code=400, detail="Root nodes must be of level 'installation'")
    
    node_id = str(uuid.uuid4())
    
    max_sort = await db.equipment_nodes.find_one(
        {"parent_id": node_data.parent_id, "created_by": current_user["id"]},
        sort=[("sort_order", -1)],
        projection={"sort_order": 1}
    )
    next_sort_order = (max_sort.get("sort_order", 0) if max_sort else 0) + 1
    
    node_doc = {
        "id": node_id,
        "name": node_data.name,
        "level": node_data.level.value,
        "parent_id": node_data.parent_id,
        "equipment_type_id": node_data.equipment_type_id,
        "description": node_data.description,
        "criticality": None,
        "discipline": None,
        "sort_order": next_sort_order,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(node_doc)
    node_doc.pop("_id", None)
    return node_doc


@router.patch("/nodes/{node_id}")
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
                raise HTTPException(status_code=400, detail="Invalid parent-child relationship per ISO 14224")
            
            current_parent = update.parent_id
            while current_parent:
                if current_parent == node_id:
                    raise HTTPException(status_code=400, detail="Circular reference detected")
                parent_node = await db.equipment_nodes.find_one({"id": current_parent})
                current_parent = parent_node.get("parent_id") if parent_node else None
        else:
            if node["level"] != ISOLevel.INSTALLATION.value:
                raise HTTPException(status_code=400, detail="Only installations can be root nodes")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.equipment_nodes.update_one({"id": node_id}, {"$set": update_data})
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated


@router.delete("/nodes/{node_id}")
async def delete_equipment_node(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an equipment hierarchy node and all its children."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    async def delete_descendants(parent_id: str):
        children = await db.equipment_nodes.find(
            {"parent_id": parent_id, "created_by": current_user["id"]}
        ).to_list(100)
        for child in children:
            await delete_descendants(child["id"])
            await db.equipment_nodes.delete_one({"id": child["id"]})
    
    await delete_descendants(node_id)
    await db.equipment_nodes.delete_one({"id": node_id})
    
    return {"message": "Equipment node and children deleted"}


@router.post("/nodes/{node_id}/criticality")
async def set_node_criticality(
    node_id: str,
    criticality: CriticalityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Set criticality for an equipment node with 4-dimension model."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    safety = criticality.safety_impact or 0
    production = criticality.production_impact or 0
    environmental = criticality.environmental_impact or 0
    reputation = criticality.reputation_impact or 0
    
    criticality_score = (
        (safety * 25) + (production * 20) + (environmental * 15) + (reputation * 10)
    ) / 3.5
    criticality_score = min(100, int(criticality_score))
    
    max_impact = max(safety, production, environmental, reputation)
    if max_impact >= 5:
        level = "safety_critical"
    elif max_impact >= 4:
        level = "production_critical"
    elif max_impact >= 3:
        level = "medium"
    else:
        level = "low"
    
    criticality_data = {
        "safety_impact": safety,
        "production_impact": production,
        "environmental_impact": environmental,
        "reputation_impact": reputation,
        "level": level,
        "criticality_score": criticality_score
    }
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "criticality": criticality_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    asset_name = node.get("name")
    updated_threats = 0
    if asset_name:
        updated_threats = await recalculate_threat_scores_for_asset(
            asset_name, current_user["id"], criticality_data, node_id
        )
        logger.info(f"Updated {updated_threats} threat scores after criticality change for {asset_name}")
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    updated["threats_updated"] = updated_threats
    return updated


@router.post("/nodes/{node_id}/discipline")
async def set_node_discipline(
    node_id: str,
    discipline_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Set discipline for an equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    discipline = discipline_data.get("discipline")
    if discipline and discipline not in [d.value for d in Discipline]:
        raise HTTPException(status_code=400, detail=f"Invalid discipline. Must be one of: {[d.value for d in Discipline]}")
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "discipline": discipline,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated


@router.post("/nodes/{node_id}/reorder")
async def reorder_node(
    node_id: str,
    request: NodeReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node up or down among its siblings."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    siblings = await db.equipment_nodes.find(
        {"parent_id": node["parent_id"], "created_by": current_user["id"]}
    ).sort("sort_order", 1).to_list(100)
    
    current_index = next((i for i, s in enumerate(siblings) if s["id"] == node_id), -1)
    if current_index == -1:
        raise HTTPException(status_code=500, detail="Node not found in siblings")
    
    if request.direction == "up":
        if current_index == 0:
            raise HTTPException(status_code=400, detail="Node is already at the top")
        swap_index = current_index - 1
    else:
        if current_index == len(siblings) - 1:
            raise HTTPException(status_code=400, detail="Node is already at the bottom")
        swap_index = current_index + 1
    
    current_sort = siblings[current_index].get("sort_order", current_index)
    swap_sort = siblings[swap_index].get("sort_order", swap_index)
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {"sort_order": swap_sort}}
    )
    await db.equipment_nodes.update_one(
        {"id": siblings[swap_index]["id"]},
        {"$set": {"sort_order": current_sort}}
    )
    
    return {"message": f"Node moved {request.direction}"}


@router.post("/nodes/{node_id}/move")
async def move_node(
    node_id: str,
    request: NodeMoveRequest,
    current_user: dict = Depends(get_current_user)
):
    """Move a node to a different parent."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    if request.new_parent_id:
        new_parent = await db.equipment_nodes.find_one(
            {"id": request.new_parent_id, "created_by": current_user["id"]}
        )
        if not new_parent:
            raise HTTPException(status_code=400, detail="New parent not found")
        
        parent_level = ISOLevel(new_parent["level"])
        child_level = ISOLevel(node["level"])
        if not is_valid_parent_child(parent_level, child_level):
            raise HTTPException(status_code=400, detail="Invalid parent-child relationship")
        
        current_parent = request.new_parent_id
        while current_parent:
            if current_parent == node_id:
                raise HTTPException(status_code=400, detail="Cannot move node under itself")
            parent_node = await db.equipment_nodes.find_one({"id": current_parent})
            current_parent = parent_node.get("parent_id") if parent_node else None
    else:
        if node["level"] != ISOLevel.INSTALLATION.value:
            raise HTTPException(status_code=400, detail="Only installations can be root nodes")
    
    max_sort = await db.equipment_nodes.find_one(
        {"parent_id": request.new_parent_id, "created_by": current_user["id"]},
        sort=[("sort_order", -1)],
        projection={"sort_order": 1}
    )
    new_sort_order = (max_sort.get("sort_order", 0) if max_sort else 0) + 1
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "parent_id": request.new_parent_id,
            "sort_order": new_sort_order,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated


@router.get("/stats")
async def get_equipment_stats(current_user: dict = Depends(get_current_user)):
    """Get equipment hierarchy statistics."""
    nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(1000)
    
    level_counts = {}
    discipline_counts = {}
    criticality_counts = {"safety_critical": 0, "production_critical": 0, "medium": 0, "low": 0, "unassigned": 0}
    
    for node in nodes:
        level = node.get("level", "unknown")
        level_counts[level] = level_counts.get(level, 0) + 1
        
        discipline = node.get("discipline") or "unassigned"
        discipline_counts[discipline] = discipline_counts.get(discipline, 0) + 1
        
        crit = node.get("criticality")
        if crit:
            crit_level = crit.get("level", "low")
            criticality_counts[crit_level] = criticality_counts.get(crit_level, 0) + 1
        else:
            criticality_counts["unassigned"] += 1
    
    return {
        "total_nodes": len(nodes),
        "by_level": level_counts,
        "by_discipline": discipline_counts,
        "by_criticality": criticality_counts
    }


# ============= UNSTRUCTURED DATA ROUTES =============

@router.get("/unstructured")
async def get_unstructured_items(current_user: dict = Depends(get_current_user)):
    """Get unassigned/unstructured equipment items."""
    items = await db.unstructured_equipment.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(500)
    return {"items": items}


@router.post("/unstructured")
async def add_unstructured_item(
    item: UnstructuredItem,
    current_user: dict = Depends(get_current_user)
):
    """Add an unstructured equipment item for later assignment."""
    item_doc = {
        "id": str(uuid.uuid4()),
        "text": item.text,
        "source": item.source,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.unstructured_equipment.insert_one(item_doc)
    item_doc.pop("_id", None)
    return item_doc


@router.post("/parse-list")
async def parse_equipment_list(
    request: ParseListRequest,
    current_user: dict = Depends(get_current_user)
):
    """Parse a list of equipment items and add them as unstructured."""
    added = []
    for text in request.items:
        text = text.strip()
        if not text:
            continue
        
        existing = await db.unstructured_equipment.find_one({
            "text": text,
            "created_by": current_user["id"]
        })
        if existing:
            continue
        
        item_doc = {
            "id": str(uuid.uuid4()),
            "text": text,
            "source": "list_import",
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.unstructured_equipment.insert_one(item_doc)
        item_doc.pop("_id", None)
        added.append(item_doc)
    
    return {"added": added, "count": len(added)}


@router.post("/unstructured/{item_id}/assign")
async def assign_unstructured_item(
    item_id: str,
    request: AssignUnstructuredRequest,
    current_user: dict = Depends(get_current_user)
):
    """Assign an unstructured item to the hierarchy."""
    item = await db.unstructured_equipment.find_one(
        {"id": item_id, "created_by": current_user["id"]}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Unstructured item not found")
    
    parent = await db.equipment_nodes.find_one(
        {"id": request.parent_id, "created_by": current_user["id"]}
    )
    if not parent:
        raise HTTPException(status_code=400, detail="Parent node not found")
    
    parent_level = ISOLevel(parent["level"])
    if not is_valid_parent_child(parent_level, request.level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid level for this parent. Valid options: {[c.value for c in valid_children]}"
        )
    
    node_id = str(uuid.uuid4())
    max_sort = await db.equipment_nodes.find_one(
        {"parent_id": request.parent_id, "created_by": current_user["id"]},
        sort=[("sort_order", -1)],
        projection={"sort_order": 1}
    )
    next_sort_order = (max_sort.get("sort_order", 0) if max_sort else 0) + 1
    
    node_doc = {
        "id": node_id,
        "name": item["text"],
        "level": request.level.value,
        "parent_id": request.parent_id,
        "equipment_type_id": request.equipment_type_id,
        "description": f"Imported from unstructured: {item.get('source', 'manual')}",
        "criticality": None,
        "discipline": None,
        "sort_order": next_sort_order,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(node_doc)
    await db.unstructured_equipment.delete_one({"id": item_id})
    
    node_doc.pop("_id", None)
    return node_doc


@router.delete("/unstructured/{item_id}")
async def delete_unstructured_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an unstructured item."""
    result = await db.unstructured_equipment.delete_one(
        {"id": item_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}


@router.delete("/unstructured")
async def clear_unstructured_items(current_user: dict = Depends(get_current_user)):
    """Clear all unstructured items for the user."""
    result = await db.unstructured_equipment.delete_many(
        {"created_by": current_user["id"]}
    )
    return {"message": f"Deleted {result.deleted_count} items"}
