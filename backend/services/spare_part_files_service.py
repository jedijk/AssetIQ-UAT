"""Spare part file attachments — upload, download, view, delete."""
import base64
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from database import db
from services.storage_service import delete_object_async, get_object_async, put_object_async
from services.tenant_schema import merge_tenant_filter, with_tenant_id

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def _assert_spare_part(user: dict, spare_part_id: str) -> dict:
    doc = await db.spare_parts.find_one(
        merge_tenant_filter({"id": spare_part_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Spare part not found")
    return doc


async def list_spare_part_files(user: dict, spare_part_id: str) -> dict:
    await _assert_spare_part(user, spare_part_id)
    files = await db.spare_part_files.find(
        merge_tenant_filter({"spare_part_id": spare_part_id}, user),
        {"_id": 0},
    ).sort("uploaded_at", -1).to_list(100)
    return {"files": files}


async def upload_spare_part_file(user: dict, spare_part_id: str, file: UploadFile) -> dict:
    await _assert_spare_part(user, spare_part_id)
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    storage_path = f"spare_parts/{spare_part_id}/{file_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    await put_object_async(storage_path, content, content_type)

    doc = with_tenant_id({
        "id": file_id,
        "spare_part_id": spare_part_id,
        "filename": file.filename,
        "content_type": content_type,
        "size": len(content),
        "storage_path": storage_path,
        "uploaded_by": user.get("id"),
        "uploaded_by_name": user.get("name", "Unknown"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }, user)
    await db.spare_part_files.insert_one(doc)
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


async def download_spare_part_file(user: dict, file_id: str) -> Response:
    doc = await db.spare_part_files.find_one(
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


async def view_spare_part_file(user: dict, file_id: str) -> Response:
    doc = await db.spare_part_files.find_one(
        merge_tenant_filter({"id": file_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    content, ct = await _load_file_content(doc)
    return Response(
        content=content,
        media_type=ct,
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'},
    )


async def delete_spare_part_file(user: dict, file_id: str) -> dict:
    doc = await db.spare_part_files.find_one(
        merge_tenant_filter({"id": file_id}, user),
        {"_id": 0, "storage_path": 1},
    )
    if doc and doc.get("storage_path"):
        try:
            await delete_object_async(doc["storage_path"])
        except Exception as exc:
            logger.warning("Failed to delete spare part file from storage: %s", exc)
    result = await db.spare_part_files.delete_one(
        merge_tenant_filter({"id": file_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}
