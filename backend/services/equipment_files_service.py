"""Equipment file attachments — upload, download, view, delete."""
import base64
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from database import db, installation_filter
from services.storage_service import put_object_async, get_object_async, delete_object_async
from services.tenant_schema import merge_tenant_filter, with_tenant_id

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def list_equipment_files(user: dict, equipment_id: str) -> dict:
    eq = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": equipment_id}, user),
        {"_id": 0, "id": 1},
    )
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    files = await db.equipment_files.find(
        merge_tenant_filter({"equipment_id": equipment_id}, user),
        {"_id": 0},
    ).sort("uploaded_at", -1).to_list(100)

    return {"files": files}


async def upload_equipment_file(
    user: dict,
    equipment_id: str,
    file: UploadFile,
) -> dict:
    eq = await db.equipment_nodes.find_one(
        merge_tenant_filter({"id": equipment_id}, user),
        {"_id": 0, "id": 1, "name": 1},
    )
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    storage_path = f"equipment/{equipment_id}/{file_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"

    await put_object_async(storage_path, content, content_type)

    doc = with_tenant_id({
        "id": file_id,
        "equipment_id": equipment_id,
        "filename": file.filename,
        "content_type": content_type,
        "size": len(content),
        "storage_path": storage_path,
        "uploaded_by": user.get("id"),
        "uploaded_by_name": user.get("name", "Unknown"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }, user)
    await db.equipment_files.insert_one(doc)
    logger.info("File uploaded: %s (%s bytes) for equipment %s", file.filename, len(content), equipment_id)

    return {
        "id": file_id,
        "filename": file.filename,
        "content_type": content_type,
        "size": len(content),
        "uploaded_by_name": doc["uploaded_by_name"],
        "uploaded_at": doc["uploaded_at"],
    }


async def _load_file_content(doc: dict) -> tuple:
    content = None
    ct = None
    if doc.get("storage_path"):
        try:
            content, ct = await get_object_async(doc["storage_path"])
        except FileNotFoundError:
            content = None
            ct = None

    if content is None and doc.get("data"):
        content = base64.b64decode(doc["data"])
        ct = doc.get("content_type", "application/octet-stream")

    if content is None:
        raise HTTPException(status_code=404, detail="File content not found")
    return content, ct


async def download_equipment_file(user: dict, file_id: str) -> Response:
    doc = await db.equipment_files.find_one(
        merge_tenant_filter({"id": file_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    content, ct = await _load_file_content(doc)
    return Response(
        content=content,
        media_type=ct,
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


async def view_equipment_file(user: dict, file_id: str) -> Response:
    doc = await db.equipment_files.find_one(
        merge_tenant_filter({"id": file_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    equipment_id = doc.get("equipment_id")
    if equipment_id:
        await installation_filter.assert_user_can_access_equipment(user, equipment_id)

    content, ct = await _load_file_content(doc)
    return Response(
        content=content,
        media_type=ct,
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'},
    )


async def delete_equipment_file(user: dict, file_id: str) -> dict:
    doc = await db.equipment_files.find_one(
        merge_tenant_filter({"id": file_id}, user),
        {"_id": 0, "storage_path": 1},
    )

    if doc and doc.get("storage_path"):
        try:
            await delete_object_async(doc["storage_path"])
        except Exception as e:
            logger.warning("Failed to delete from storage: %s", e)

    result = await db.equipment_files.delete_one(
        merge_tenant_filter({"id": file_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}
