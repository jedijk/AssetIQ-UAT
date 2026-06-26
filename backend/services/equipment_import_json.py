"""Equipment hierarchy import — JSON hierarchy import."""
from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
import logging
from database import db
from services.tenant_schema import merge_tenant_filter, with_tenant_id

logger = logging.getLogger(__name__)


class HierarchyImportRequest(BaseModel):
    installation_id: str
    hierarchy: dict
    replace_existing: bool = True


async def import_equipment_hierarchy(user: dict, request: HierarchyImportRequest) -> dict:
    """Import a complete equipment hierarchy for an installation."""
    if user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    installation = await db.installations.find_one({"id": request.installation_id})
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    
    installation_id = request.installation_id
    
    deleted_count = 0
    if request.replace_existing:
        result = await db.equipment.delete_many({"installation_id": installation_id})
        deleted_count = result.deleted_count
    
    equipment_list = []
    sort_order = 0
    
    def create_equipment(name, parent_id, eq_type, level):
        nonlocal sort_order
        sort_order += 1
        return {
            "id": str(uuid.uuid4()),
            "name": name,
            "parent_id": parent_id,
            "installation_id": installation_id,
            "type": eq_type,
            "level": level,
            "sort_order": sort_order,
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    
    def process_hierarchy(data, parent_id=None, level=0):
        items = []
        for name, info in data.items():
            if isinstance(info, dict):
                eq_type = info.get("type", "equipment")
                eq = create_equipment(name, parent_id, eq_type, level)
                items.append(eq)
                
                children = info.get("children", {})
                if isinstance(children, dict):
                    items.extend(process_hierarchy(children, eq["id"], level + 1))
                elif isinstance(children, list):
                    for child_name in children:
                        child_eq = create_equipment(child_name, eq["id"], "maintainable_item", level + 1)
                        items.append(child_eq)
        return items
    
    equipment_list = process_hierarchy(request.hierarchy)
    
    inserted_count = 0
    if equipment_list:
        result = await db.equipment.insert_many(equipment_list)
        inserted_count = len(result.inserted_ids)
    
    logger.info(f"Hierarchy import: deleted={deleted_count}, inserted={inserted_count}")
    
    return {
        "success": True,
        "installation_id": installation_id,
        "deleted_count": deleted_count,
        "inserted_count": inserted_count,
        "message": f"Successfully imported {inserted_count} equipment items"
    }
