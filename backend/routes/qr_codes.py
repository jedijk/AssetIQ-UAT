"""
QR Code Management Module
- QR Generation
- Hierarchy Assignment
- Action Configuration
- Print & Export
"""

import uuid
import io
import base64
import zipfile
import csv
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import qrcode
import qrcode.image.svg
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from database import db
from routes.auth import get_current_user

router = APIRouter(prefix="/qr", tags=["QR Codes"])

# ==================== MODELS ====================

class QRActionConfig(BaseModel):
    action_type: str  # "view_asset", "report_observation", "open_checklist", "view_documents", "custom"
    label: str
    enabled: bool = True
    config: dict = Field(default_factory=dict)  # checklist_id, redirect_url, etc.

class QRCreateRequest(BaseModel):
    label: Optional[str] = None
    hierarchy_item_id: Optional[str] = None
    actions: List[QRActionConfig] = Field(default_factory=list)
    default_action: Optional[str] = "view_asset"

class QRUpdateRequest(BaseModel):
    label: Optional[str] = None
    hierarchy_item_id: Optional[str] = None
    actions: Optional[List[QRActionConfig]] = None
    default_action: Optional[str] = None
    status: Optional[str] = None

class QRBulkCreateRequest(BaseModel):
    hierarchy_item_ids: List[str]
    default_action: str = "view_asset"
    actions: List[QRActionConfig] = Field(default_factory=list)

class QRPrintRequest(BaseModel):
    qr_ids: List[str]
    template: str = "single"  # "single", "a4_3x3", "a4_4x5", "a4_2x2"
    size: str = "medium"  # "small", "medium", "large", "custom"
    custom_size_mm: Optional[int] = None
    show_label: bool = True
    show_description: bool = False
    show_logo: bool = False

class QRExportRequest(BaseModel):
    qr_ids: List[str]
    format: str = "png"  # "png", "svg", "pdf", "zip", "csv"
    include_metadata: bool = False

# ==================== HELPERS ====================

def get_frontend_url():
    """Get the frontend URL for QR code links"""
    import os
    return os.environ.get("REACT_APP_BACKEND_URL", "https://asset-iq-preview.preview.emergentagent.com")

def generate_qr_image(qr_id: str, size: int = 200):
    """Generate a QR code image"""
    frontend_url = get_frontend_url()
    qr_url = f"{frontend_url}/qr/{qr_id}"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(qr_url)
    qr.make(fit=True)
    
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer()
    )
    
    # Resize to requested size
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    return img

def generate_qr_with_label(qr_id: str, label: str, size: int = 200, show_label: bool = True):
    """Generate QR code with optional label below"""
    qr_img = generate_qr_image(qr_id, size)
    
    if not show_label or not label:
        return qr_img
    
    # Create a new image with space for label
    label_height = 30
    total_height = size + label_height
    final_img = Image.new('RGB', (size, total_height), 'white')
    
    # Paste QR code
    final_img.paste(qr_img, (0, 0))
    
    # Add label text
    draw = ImageDraw.Draw(final_img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    
    # Center the text
    text_bbox = draw.textbbox((0, 0), label, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_x = (size - text_width) // 2
    text_y = size + 5
    
    draw.text((text_x, text_y), label, fill='black', font=font)
    
    return final_img

def image_to_base64(img: Image.Image, format: str = "PNG") -> str:
    """Convert PIL Image to base64 string"""
    buffer = io.BytesIO()
    img.save(buffer, format=format)
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode()

def get_size_pixels(size: str, custom_mm: Optional[int] = None) -> int:
    """Convert size name to pixels (at 96 DPI)"""
    sizes = {
        "small": 150,    # ~5cm at 96 DPI
        "medium": 240,   # ~8cm
        "large": 360,    # ~12cm
    }
    if size == "custom" and custom_mm:
        return int(custom_mm * 3.78)  # mm to pixels at 96 DPI
    return sizes.get(size, 240)

# ==================== ROUTES ====================

@router.post("/generate")
async def generate_qr_code(request: QRCreateRequest, user: dict = Depends(get_current_user)):
    """Generate a new QR code"""
    qr_id = str(uuid.uuid4())
    frontend_url = get_frontend_url()
    
    # Get hierarchy item info if provided
    hierarchy_item = None
    if request.hierarchy_item_id:
        hierarchy_item = await db.equipment_nodes.find_one(
            {"id": request.hierarchy_item_id},
            {"_id": 0, "id": 1, "name": 1, "level": 1, "tag": 1}
        )
    
    # Set default actions if none provided
    actions = request.actions if request.actions else [
        QRActionConfig(action_type="view_asset", label="View Asset Dashboard", enabled=True),
        QRActionConfig(action_type="report_observation", label="Report Observation", enabled=True)
    ]
    
    # Create QR record
    qr_doc = {
        "id": qr_id,
        "label": request.label or (hierarchy_item["name"] if hierarchy_item else f"QR-{qr_id[:8]}"),
        "hierarchy_item_id": request.hierarchy_item_id,
        "hierarchy_item_name": hierarchy_item["name"] if hierarchy_item else None,
        "hierarchy_item_level": hierarchy_item["level"] if hierarchy_item else None,
        "url": f"{frontend_url}/qr/{qr_id}",
        "status": "active",
        "default_action": request.default_action,
        "actions": [a.dict() for a in actions],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scan_count": 0,
        "last_scanned_at": None
    }
    
    await db.qr_codes.insert_one(qr_doc)
    
    # Remove _id from response
    qr_doc.pop("_id", None)
    
    # Generate QR image
    qr_image = generate_qr_with_label(qr_id, qr_doc["label"])
    qr_base64 = image_to_base64(qr_image)
    
    return {
        **qr_doc,
        "qr_image": f"data:image/png;base64,{qr_base64}"
    }

@router.post("/generate-bulk")
async def generate_bulk_qr_codes(request: QRBulkCreateRequest, user: dict = Depends(get_current_user)):
    """Generate QR codes for multiple hierarchy items"""
    results = []
    frontend_url = get_frontend_url()
    
    for item_id in request.hierarchy_item_ids:
        hierarchy_item = await db.equipment_nodes.find_one(
            {"id": item_id},
            {"_id": 0, "id": 1, "name": 1, "level": 1, "tag": 1}
        )
        
        if not hierarchy_item:
            results.append({"hierarchy_item_id": item_id, "error": "Item not found"})
            continue
        
        # Check if QR already exists for this item
        existing = await db.qr_codes.find_one({"hierarchy_item_id": item_id, "status": "active"})
        if existing:
            results.append({
                "hierarchy_item_id": item_id,
                "qr_id": existing["id"],
                "status": "existing",
                "message": "QR code already exists for this item"
            })
            continue
        
        qr_id = str(uuid.uuid4())
        
        actions = request.actions if request.actions else [
            QRActionConfig(action_type="view_asset", label="View Asset Dashboard", enabled=True),
            QRActionConfig(action_type="report_observation", label="Report Observation", enabled=True)
        ]
        
        qr_doc = {
            "id": qr_id,
            "label": hierarchy_item.get("tag") or hierarchy_item["name"],
            "hierarchy_item_id": item_id,
            "hierarchy_item_name": hierarchy_item["name"],
            "hierarchy_item_level": hierarchy_item["level"],
            "url": f"{frontend_url}/qr/{qr_id}",
            "status": "active",
            "default_action": request.default_action,
            "actions": [a.dict() for a in actions],
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "scan_count": 0,
            "last_scanned_at": None
        }
        
        await db.qr_codes.insert_one(qr_doc)
        results.append({
            "hierarchy_item_id": item_id,
            "qr_id": qr_id,
            "status": "created",
            "label": qr_doc["label"]
        })
    
    return {
        "total": len(request.hierarchy_item_ids),
        "created": len([r for r in results if r.get("status") == "created"]),
        "existing": len([r for r in results if r.get("status") == "existing"]),
        "errors": len([r for r in results if r.get("error")]),
        "results": results
    }

@router.get("/list")
async def list_qr_codes(
    status: Optional[str] = None,
    hierarchy_item_id: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    skip: int = 0,
    user: dict = Depends(get_current_user)
):
    """List all QR codes"""
    query = {}
    if status:
        query["status"] = status
    if hierarchy_item_id:
        query["hierarchy_item_id"] = hierarchy_item_id
    
    qr_codes = await db.qr_codes.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.qr_codes.count_documents(query)
    
    return {
        "qr_codes": qr_codes,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.get("/{qr_id}")
async def get_qr_code(qr_id: str, user: dict = Depends(get_current_user)):
    """Get QR code details"""
    qr = await db.qr_codes.find_one({"id": qr_id}, {"_id": 0})
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    
    # Generate QR image
    qr_image = generate_qr_with_label(qr_id, qr.get("label", ""))
    qr_base64 = image_to_base64(qr_image)
    
    return {
        **qr,
        "qr_image": f"data:image/png;base64,{qr_base64}"
    }

@router.get("/{qr_id}/image")
async def get_qr_image(
    qr_id: str,
    size: str = "medium",
    custom_size_mm: Optional[int] = None,
    show_label: bool = True,
    format: str = "png"
):
    """Get QR code image (no auth required for embedding)"""
    qr = await db.qr_codes.find_one({"id": qr_id}, {"_id": 0, "label": 1})
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    
    size_px = get_size_pixels(size, custom_size_mm)
    qr_image = generate_qr_with_label(qr_id, qr.get("label", ""), size_px, show_label)
    
    buffer = io.BytesIO()
    if format.lower() == "svg":
        # For SVG, we need to regenerate
        frontend_url = get_frontend_url()
        qr_url = f"{frontend_url}/qr/{qr_id}"
        qr_obj = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
        qr_obj.add_data(qr_url)
        qr_obj.make(fit=True)
        
        img = qr_obj.make_image(image_factory=qrcode.image.svg.SvgImage)
        img.save(buffer)
        media_type = "image/svg+xml"
    else:
        qr_image.save(buffer, format="PNG")
        media_type = "image/png"
    
    buffer.seek(0)
    return StreamingResponse(buffer, media_type=media_type)

@router.put("/{qr_id}")
async def update_qr_code(qr_id: str, request: QRUpdateRequest, user: dict = Depends(get_current_user)):
    """Update QR code settings"""
    qr = await db.qr_codes.find_one({"id": qr_id})
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if request.label is not None:
        update_data["label"] = request.label
    if request.hierarchy_item_id is not None:
        hierarchy_item = await db.equipment_nodes.find_one(
            {"id": request.hierarchy_item_id},
            {"_id": 0, "id": 1, "name": 1, "level": 1}
        )
        if hierarchy_item:
            update_data["hierarchy_item_id"] = request.hierarchy_item_id
            update_data["hierarchy_item_name"] = hierarchy_item["name"]
            update_data["hierarchy_item_level"] = hierarchy_item["level"]
    if request.actions is not None:
        update_data["actions"] = [a.dict() for a in request.actions]
    if request.default_action is not None:
        update_data["default_action"] = request.default_action
    if request.status is not None:
        update_data["status"] = request.status
    
    await db.qr_codes.update_one({"id": qr_id}, {"$set": update_data})
    
    updated = await db.qr_codes.find_one({"id": qr_id}, {"_id": 0})
    return updated

@router.delete("/{qr_id}")
async def delete_qr_code(qr_id: str, user: dict = Depends(get_current_user)):
    """Delete (deactivate) a QR code"""
    result = await db.qr_codes.update_one(
        {"id": qr_id},
        {"$set": {"status": "inactive", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="QR code not found")
    return {"success": True, "message": "QR code deactivated"}

# ==================== SCAN RESOLUTION ====================

@router.get("/resolve/{qr_id}")
async def resolve_qr_code(qr_id: str, user: dict = Depends(get_current_user)):
    """Resolve QR code scan - returns actions and hierarchy info"""
    qr = await db.qr_codes.find_one({"id": qr_id}, {"_id": 0})
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    
    if qr.get("status") != "active":
        raise HTTPException(status_code=410, detail="QR code is no longer active")
    
    # Update scan count
    await db.qr_codes.update_one(
        {"id": qr_id},
        {
            "$inc": {"scan_count": 1},
            "$set": {"last_scanned_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Get hierarchy item details
    hierarchy_item = None
    if qr.get("hierarchy_item_id"):
        hierarchy_item = await db.equipment_nodes.find_one(
            {"id": qr["hierarchy_item_id"]},
            {"_id": 0}
        )
    
    # Get enabled actions
    enabled_actions = [a for a in qr.get("actions", []) if a.get("enabled", True)]
    
    return {
        "qr_id": qr_id,
        "label": qr.get("label"),
        "hierarchy_item": hierarchy_item,
        "default_action": qr.get("default_action"),
        "actions": enabled_actions,
        "has_multiple_actions": len(enabled_actions) > 1
    }

# ==================== PRINT & EXPORT ====================

@router.post("/print")
async def print_qr_codes(request: QRPrintRequest, user: dict = Depends(get_current_user)):
    """Generate printable PDF of QR codes"""
    qr_codes = await db.qr_codes.find(
        {"id": {"$in": request.qr_ids}},
        {"_id": 0}
    ).to_list(len(request.qr_ids))
    
    if not qr_codes:
        raise HTTPException(status_code=404, detail="No QR codes found")
    
    # Template configurations
    templates = {
        "single": {"cols": 1, "rows": 1, "page_size": letter},
        "a4_2x2": {"cols": 2, "rows": 2, "page_size": A4},
        "a4_3x3": {"cols": 3, "rows": 3, "page_size": A4},
        "a4_4x5": {"cols": 4, "rows": 5, "page_size": A4},
    }
    
    template_config = templates.get(request.template, templates["single"])
    cols = template_config["cols"]
    rows = template_config["rows"]
    page_size = template_config["page_size"]
    
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=page_size)
    page_width, page_height = page_size
    
    # Calculate cell size
    margin = 1 * cm
    cell_width = (page_width - 2 * margin) / cols
    cell_height = (page_height - 2 * margin) / rows
    qr_size = min(cell_width, cell_height) * 0.8
    
    qr_index = 0
    while qr_index < len(qr_codes):
        for row in range(rows):
            for col in range(cols):
                if qr_index >= len(qr_codes):
                    break
                
                qr = qr_codes[qr_index]
                
                # Generate QR image
                qr_img = generate_qr_with_label(
                    qr["id"],
                    qr.get("label", ""),
                    int(qr_size * 2),  # Higher res for print
                    request.show_label
                )
                
                # Convert to ImageReader
                img_buffer = io.BytesIO()
                qr_img.save(img_buffer, format="PNG")
                img_buffer.seek(0)
                img_reader = ImageReader(img_buffer)
                
                # Calculate position
                x = margin + col * cell_width + (cell_width - qr_size) / 2
                y = page_height - margin - (row + 1) * cell_height + (cell_height - qr_size) / 2
                
                # Draw QR code
                c.drawImage(img_reader, x, y, qr_size, qr_size)
                
                qr_index += 1
        
        if qr_index < len(qr_codes):
            c.showPage()
    
    c.save()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=qr_codes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"}
    )

@router.post("/export")
async def export_qr_codes(request: QRExportRequest, user: dict = Depends(get_current_user)):
    """Export QR codes in various formats"""
    qr_codes = await db.qr_codes.find(
        {"id": {"$in": request.qr_ids}},
        {"_id": 0}
    ).to_list(len(request.qr_ids))
    
    if not qr_codes:
        raise HTTPException(status_code=404, detail="No QR codes found")
    
    if request.format == "zip":
        # Create ZIP with all QR images
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for qr in qr_codes:
                qr_img = generate_qr_with_label(qr["id"], qr.get("label", ""), 300, True)
                img_buffer = io.BytesIO()
                qr_img.save(img_buffer, format="PNG")
                img_buffer.seek(0)
                
                filename = f"{qr.get('label', qr['id'][:8]).replace(' ', '_')}.png"
                zf.writestr(filename, img_buffer.getvalue())
            
            if request.include_metadata:
                # Add CSV metadata
                csv_buffer = io.StringIO()
                writer = csv.writer(csv_buffer)
                writer.writerow(["QR_ID", "Label", "Equipment", "Level", "URL", "Status", "Created"])
                for qr in qr_codes:
                    writer.writerow([
                        qr["id"],
                        qr.get("label", ""),
                        qr.get("hierarchy_item_name", ""),
                        qr.get("hierarchy_item_level", ""),
                        qr.get("url", ""),
                        qr.get("status", ""),
                        qr.get("created_at", "")
                    ])
                zf.writestr("metadata.csv", csv_buffer.getvalue())
        
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=qr_codes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"}
        )
    
    elif request.format == "csv":
        # Export metadata as CSV
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["QR_ID", "Label", "Equipment", "Level", "URL", "Status", "Scan_Count", "Created"])
        for qr in qr_codes:
            writer.writerow([
                qr["id"],
                qr.get("label", ""),
                qr.get("hierarchy_item_name", ""),
                qr.get("hierarchy_item_level", ""),
                qr.get("url", ""),
                qr.get("status", ""),
                qr.get("scan_count", 0),
                qr.get("created_at", "")
            ])
        
        output = io.BytesIO(buffer.getvalue().encode())
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=qr_codes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
    
    elif request.format in ["png", "svg"]:
        # Single QR export (first one if multiple selected)
        qr = qr_codes[0]
        qr_img = generate_qr_with_label(qr["id"], qr.get("label", ""), 400, True)
        
        buffer = io.BytesIO()
        if request.format == "svg":
            frontend_url = get_frontend_url()
            qr_url = f"{frontend_url}/qr/{qr['id']}"
            qr_obj = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
            qr_obj.add_data(qr_url)
            qr_obj.make(fit=True)
            
            img = qr_obj.make_image(image_factory=qrcode.image.svg.SvgImage)
            img.save(buffer)
            media_type = "image/svg+xml"
            ext = "svg"
        else:
            qr_img.save(buffer, format="PNG")
            media_type = "image/png"
            ext = "png"
        
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={qr.get('label', qr['id'][:8]).replace(' ', '_')}.{ext}"}
        )
    
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")

# ==================== EQUIPMENT INTEGRATION ====================

@router.get("/equipment/{equipment_id}")
async def get_qr_for_equipment(equipment_id: str, user: dict = Depends(get_current_user)):
    """Get QR code for a specific equipment item"""
    qr = await db.qr_codes.find_one(
        {"hierarchy_item_id": equipment_id, "status": "active"},
        {"_id": 0}
    )
    
    if qr:
        qr_image = generate_qr_with_label(qr["id"], qr.get("label", ""))
        qr["qr_image"] = f"data:image/png;base64,{image_to_base64(qr_image)}"
    
    return {"qr_code": qr}

@router.post("/equipment/{equipment_id}/generate")
async def generate_qr_for_equipment(
    equipment_id: str,
    default_action: str = "view_asset",
    user: dict = Depends(get_current_user)
):
    """Generate QR code for a specific equipment item"""
    # Check if QR already exists
    existing = await db.qr_codes.find_one(
        {"hierarchy_item_id": equipment_id, "status": "active"}
    )
    if existing:
        qr_image = generate_qr_with_label(existing["id"], existing.get("label", ""))
        return {
            **{k: v for k, v in existing.items() if k != "_id"},
            "qr_image": f"data:image/png;base64,{image_to_base64(qr_image)}",
            "already_existed": True
        }
    
    # Create new QR
    request = QRCreateRequest(
        hierarchy_item_id=equipment_id,
        default_action=default_action
    )
    return await generate_qr_code(request, user)
