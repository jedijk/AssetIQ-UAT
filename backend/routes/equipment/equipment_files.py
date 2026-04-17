"""
Equipment file attachments — upload, download, view, delete.
Uses storage_service.py for R2/MongoDB dual storage.
"""
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from auth import get_current_user
from database import db
from services.storage_service import put_object_async, get_object_async, delete_object_async

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Equipment Files"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/equipment/{equipment_id}/files")
async def get_equipment_files(
    equipment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all files attached to an equipment node."""
    eq = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0, "id": 1})
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    files = await db.equipment_files.find(
        {"equipment_id": equipment_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(100)

    return {"files": files}


@router.post("/equipment-files/{equipment_id}/upload")
async def upload_equipment_file(
    equipment_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    eq = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0, "id": 1, "name": 1})
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    storage_path = f"equipment/{equipment_id}/{file_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"

    # Upload via storage_service (R2 primary, MongoDB fallback)
    await put_object_async(storage_path, content, content_type)

    # Store metadata in equipment_files collection (no base64 data)
    doc = {
        "id": file_id,
        "equipment_id": equipment_id,
        "filename": file.filename,
        "content_type": content_type,
        "size": len(content),
        "storage_path": storage_path,
        "uploaded_by": current_user.get("id"),
        "uploaded_by_name": current_user.get("name", "Unknown"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.equipment_files.insert_one(doc)
    logger.info(f"File uploaded: {file.filename} ({len(content)} bytes) for equipment {equipment_id}")

    return {
        "id": file_id,
        "filename": file.filename,
        "content_type": content_type,
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

    # New path: fetch from storage_service via storage_path
    if doc.get("storage_path"):
        content, ct = await get_object_async(doc["storage_path"])
    # Legacy path: inline base64
    elif doc.get("data"):
        import base64
        content = base64.b64decode(doc["data"])
        ct = doc.get("content_type", "application/octet-stream")
    else:
        raise HTTPException(status_code=404, detail="File data not found")

    return Response(
        content=content,
        media_type=ct,
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


@router.get("/equipment-files/{file_id}/view")
async def view_equipment_file_public(file_id: str):
    """Public endpoint for Office Online viewer — no auth required."""
    doc = await db.equipment_files.find_one({"id": file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    from fastapi.responses import Response

    # New path: fetch from storage_service via storage_path
    if doc.get("storage_path"):
        content, ct = await get_object_async(doc["storage_path"])
    # Legacy path: inline base64
    elif doc.get("data"):
        import base64
        content = base64.b64decode(doc["data"])
        ct = doc.get("content_type", "application/octet-stream")
    else:
        raise HTTPException(status_code=404, detail="File data not found")

    return Response(
        content=content,
        media_type=ct,
        headers={
            "Content-Disposition": f'inline; filename="{doc["filename"]}"',
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.delete("/equipment-files/{file_id}")
async def delete_equipment_file(file_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.equipment_files.find_one({"id": file_id}, {"_id": 0, "storage_path": 1})

    # Delete from R2/storage if it has a storage_path
    if doc and doc.get("storage_path"):
        try:
            await delete_object_async(doc["storage_path"])
        except Exception as e:
            logger.warning(f"Failed to delete from storage: {e}")

    result = await db.equipment_files.delete_one({"id": file_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}
