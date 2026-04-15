"""Equipment file attachment endpoints — upload, list, download, delete."""
import uuid
import base64
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/equipment/{equipment_id}/files")
async def list_equipment_files(equipment_id: str, current_user: dict = Depends(get_current_user)):
    files = await db.equipment_files.find(
        {"equipment_id": equipment_id},
        {"_id": 0, "data": 0}
    ).sort("uploaded_at", -1).to_list(100)
    return {"files": files}


@router.post("/equipment/{equipment_id}/files")
async def upload_equipment_file(
    equipment_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    # Verify equipment exists
    eq = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0, "id": 1, "name": 1})
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    file_id = str(uuid.uuid4())
    doc = {
        "id": file_id,
        "equipment_id": equipment_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "data": base64.b64encode(content).decode("utf-8"),
        "uploaded_by": current_user.get("id"),
        "uploaded_by_name": current_user.get("name", "Unknown"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.equipment_files.insert_one(doc)
    logger.info(f"File uploaded: {file.filename} ({len(content)} bytes) for equipment {equipment_id}")

    return {
        "id": file_id,
        "filename": file.filename,
        "content_type": doc["content_type"],
        "size": len(content),
        "uploaded_by_name": doc["uploaded_by_name"],
        "uploaded_at": doc["uploaded_at"],
    }


@router.get("/equipment-files/{file_id}/download")
async def download_equipment_file(file_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.equipment_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    from fastapi.responses import Response
    content = base64.b64decode(doc["data"])
    return Response(
        content=content,
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


@router.get("/equipment-files/{file_id}/view")
async def view_equipment_file_public(file_id: str):
    """Public endpoint for Office Online viewer — no auth required."""
    doc = await db.equipment_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    from fastapi.responses import Response
    content = base64.b64decode(doc["data"])
    return Response(
        content=content,
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="{doc["filename"]}"',
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.delete("/equipment-files/{file_id}")
async def delete_equipment_file(file_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.equipment_files.delete_one({"id": file_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}
