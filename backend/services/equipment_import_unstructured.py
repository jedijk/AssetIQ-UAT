"""Equipment hierarchy import — unstructured items."""
from __future__ import annotations

from fastapi import HTTPException, UploadFile
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
import io
import logging
import pandas as pd
from database import db
from iso14224_models import (
    ISOLevel, ISO_LEVEL_LABELS, LEGACY_LEVEL_MAP, detect_equipment_type,
    UnstructuredItemCreate, ParseEquipmentListRequest, AssignToHierarchyRequest,
    is_valid_parent_child, get_valid_child_levels,
)
from services.criticality_score import compute_criticality_score
from services.tenant_schema import merge_tenant_filter, with_tenant_id

logger = logging.getLogger(__name__)

# =============================================================================
# UNSTRUCTURED ITEMS
# =============================================================================

async def get_unstructured_items(user: dict) -> dict:
    """Get all unstructured (unassigned) equipment items."""
    items = await db.unstructured_items.find(
        merge_tenant_filter({}, user),
        {"_id": 0},
    ).to_list(1000)
    return {"items": items}


async def create_unstructured_item(user: dict, item_data: UnstructuredItemCreate) -> dict:
    """Create a single unstructured equipment item."""
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
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.unstructured_items.insert_one(with_tenant_id(item_doc, user))
    item_doc.pop("_id", None)
    return item_doc


async def parse_equipment_list(user: dict, request: ParseEquipmentListRequest) -> dict:
    """Parse a text list and create unstructured items with auto-detection."""
    import re
    
    content = request.content.strip()
    items = re.split(r'[\n\r,;\t]+', content)
    
    seen = set()
    unique_items = []
    for item in items:
        cleaned = item.strip()
        cleaned = re.sub(r'^[\d]+[.\)]\s*', '', cleaned)
        cleaned = re.sub(r'^[-•*]\s*', '', cleaned)
        cleaned = cleaned.strip()
        
        if cleaned and len(cleaned) > 1 and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            unique_items.append(cleaned)
    
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
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.unstructured_items.insert_one(with_tenant_id(item_doc, user))
        item_doc.pop("_id", None)
        created_items.append(item_doc)
    
    return {"parsed_count": len(created_items), "items": created_items}


async def parse_equipment_file(user: dict, file: UploadFile) -> dict:
    """Parse an uploaded file (Excel, PDF, CSV, TXT) and extract equipment items."""
    import re
    
    filename = file.filename.lower()
    content = await file.read()
    
    extracted_items = []
    
    try:
        if filename.endswith('.csv') or filename.endswith('.txt'):
            text_content = content.decode('utf-8', errors='ignore')
            items = text_content.strip().split('\n')
            extracted_items = [item.strip() for item in items if item.strip()]
            
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content), header=None)
            for col in df.columns:
                for val in df[col].dropna():
                    if isinstance(val, str) and val.strip():
                        extracted_items.append(val.strip())
                    elif not pd.isna(val):
                        extracted_items.append(str(val).strip())
                        
        elif filename.endswith('.pdf'):
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            lines = text.split('\n')
                            extracted_items.extend([ln.strip() for ln in lines if ln.strip()])
            except ImportError:
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(content))
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        lines = text.split('\n')
                        extracted_items.extend([ln.strip() for ln in lines if ln.strip()])
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
    
    except Exception as e:
        logger.error(f"File parsing error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
    
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
    
    created_items = []
    for name in unique_items[:100]:
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
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.unstructured_items.insert_one(with_tenant_id(item_doc, user))
        item_doc.pop("_id", None)
        created_items.append(item_doc)
    
    return {"filename": file.filename, "parsed_count": len(created_items), "items": created_items}


async def assign_unstructured_to_hierarchy(user: dict, item_id: str, assignment: AssignToHierarchyRequest) -> dict:
    """Move an unstructured item into the ISO hierarchy."""
    item = await db.unstructured_items.find_one(
        merge_tenant_filter({"id": item_id}, user),
    )
    if not item:
        raise HTTPException(status_code=404, detail="Unstructured item not found")
    
    existing = await db.equipment_nodes.find_one(
        merge_tenant_filter({
            "name": item["name"],
            "parent_id": assignment.parent_id,
        }, user),
    )
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{item['name']}' already exists under this parent"
        )
    
    parent = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": assignment.parent_id}, user),
        {"_id": 0},
    )
    if not parent:
        raise HTTPException(status_code=400, detail="Parent node not found")
    
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
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(with_tenant_id(node_doc, user))
    node_doc.pop("_id", None)

    await db.unstructured_items.delete_one(merge_tenant_filter({"id": item_id}, user))
    
    return node_doc


async def delete_unstructured_item(user: dict, item_id: str) -> dict:
    """Delete an unstructured item."""
    result = await db.unstructured_items.delete_one(
        merge_tenant_filter({"id": item_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}


async def clear_unstructured_items(user: dict) -> dict:
    """Delete all unstructured items for the current user."""
    result = await db.unstructured_items.delete_many(
        merge_tenant_filter({}, user),
    )
    return {"message": f"Deleted {result.deleted_count} items"}

