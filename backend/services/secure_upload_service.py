"""
Secure file upload orchestration service.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, HTTPException

from config.file_upload_config import UploadStatus, USER_REJECTION_MESSAGE, SIGNED_URL_EXPIRY_SECONDS
from database import db
from services.secure_upload_access import assert_entity_access, assert_file_access
from services.secure_upload_audit import (
    EVENT_DOWNLOAD_REQUESTED,
    EVENT_UPLOAD_COMPLETED,
    EVENT_UPLOAD_INITIATED,
    log_upload_audit_event,
)
from services.secure_upload_storage import (
    fetch_bytes,
    presigned_get_url,
    presigned_put_url,
    remove_object,
    safe_key,
    store_bytes,
    supports_presigned_upload,
    temp_key,
)
from services.secure_upload_validation import (
    normalize_extension,
    validate_file_content,
    validate_upload_metadata,
)
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, with_tenant_id

logger = logging.getLogger(__name__)

COLLECTION = "uploaded_files"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _collection():
    return db[COLLECTION]


async def _get_file_doc(file_id: str, user: Optional[dict] = None) -> dict:
    query = {"id": file_id}
    if user:
        query = merge_tenant_filter(query, user)
    doc = await _collection().find_one(query, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    return doc


async def initiate_upload(
    user: dict,
    *,
    filename: str,
    content_type: Optional[str],
    size_bytes: int,
    linked_entity_type: str,
    linked_entity_id: Optional[str] = None,
) -> dict:
    await assert_entity_access(
        user,
        linked_entity_type,
        linked_entity_id,
        require_write=True,
    )

    validation = validate_upload_metadata(filename, content_type, size_bytes)
    if not validation.ok:
        raise HTTPException(status_code=400, detail=validation.reason)

    ext = validation.detected_extension or normalize_extension(filename)
    file_id = str(uuid.uuid4())
    tenant_id = tenant_id_from_user(user) or "default"
    storage_key = temp_key(tenant_id, file_id, ext)
    resolved_mime = content_type or validation.detected_mime or "application/octet-stream"

    doc = with_tenant_id({
        "id": file_id,
        "upload_id": file_id,
        "status": UploadStatus.INITIATED.value,
        "original_filename": filename,
        "content_type": resolved_mime,
        "extension": ext,
        "declared_size": size_bytes,
        "actual_size": None,
        "storage_key": storage_key,
        "safe_storage_key": None,
        "linked_entity_type": linked_entity_type,
        "linked_entity_id": linked_entity_id,
        "uploaded_by": user.get("id"),
        "uploaded_by_name": user.get("name", "Unknown"),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "completed_at": None,
        "scan_started_at": None,
        "scan_completed_at": None,
        "malware_scan_result": None,
        "rejection_reason": None,
    }, user)

    await _collection().insert_one(doc)
    doc.pop("_id", None)

    presigned_url = presigned_put_url(storage_key, resolved_mime)
    upload_method = "presigned_put" if presigned_url else "direct"

    await log_upload_audit_event(
        EVENT_UPLOAD_INITIATED,
        tenant_id=tenant_id,
        user_id=user.get("id"),
        file_id=file_id,
        linked_entity_type=linked_entity_type,
        linked_entity_id=linked_entity_id,
        file_size_bytes=size_bytes,
        details={
            "filename": filename,
            "upload_method": upload_method,
        },
    )

    return {
        "upload_id": file_id,
        "file_id": file_id,
        "status": UploadStatus.INITIATED.value,
        "upload_method": upload_method,
        "presigned_upload_url": presigned_url,
        "storage_key": storage_key,
        "expires_in_seconds": SIGNED_URL_EXPIRY_SECONDS if presigned_url else None,
    }


async def upload_bytes(user: dict, upload_id: str, data: bytes) -> dict:
    doc = await _get_file_doc(upload_id, user)
    await assert_file_access(user, doc, require_write=True)

    if doc["status"] not in {
        UploadStatus.INITIATED.value,
        UploadStatus.UPLOADING.value,
    }:
        raise HTTPException(status_code=409, detail=f"Upload not in uploadable state: {doc['status']}")

    validation = validate_file_content(
        doc["original_filename"],
        doc.get("content_type"),
        data,
    )
    if not validation.ok:
        await _collection().update_one(
            {"id": upload_id},
            {"$set": {
                "status": UploadStatus.REJECTED.value,
                "rejection_reason": validation.reason,
                "updated_at": _now_iso(),
            }},
        )
        raise HTTPException(status_code=400, detail=validation.reason)

    await store_bytes(doc["storage_key"], data, doc["content_type"])
    await _collection().update_one(
        {"id": upload_id},
        {"$set": {
            "status": UploadStatus.UPLOADED.value,
            "actual_size": len(data),
            "updated_at": _now_iso(),
        }},
    )

    await log_upload_audit_event(
        "upload_bytes_received",
        tenant_id=doc.get("tenant_id"),
        user_id=user.get("id"),
        file_id=upload_id,
        details={"size": len(data)},
    )

    return {
        "upload_id": upload_id,
        "status": UploadStatus.UPLOADED.value,
        "actual_size": len(data),
    }


async def complete_upload(
    user: dict,
    upload_id: str,
    background_tasks: BackgroundTasks,
) -> dict:
    doc = await _get_file_doc(upload_id, user)
    await assert_file_access(user, doc, require_write=True)

    if doc["status"] in {
        UploadStatus.SCANNING.value,
        UploadStatus.PENDING_SCAN.value,
        UploadStatus.PROCESSING.value,
    }:
        return {"upload_id": upload_id, "file_id": upload_id, "status": doc["status"]}

    if doc["status"] not in {
        UploadStatus.UPLOADED.value,
        UploadStatus.INITIATED.value,
    }:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot complete upload in status: {doc['status']}",
        )

    # Verify bytes exist (presigned path may have uploaded directly to R2)
    if doc["status"] == UploadStatus.INITIATED.value:
        try:
            data, _ = await fetch_bytes(doc["storage_key"])
            doc["actual_size"] = len(data)
            await _collection().update_one(
                {"id": upload_id},
                {"$set": {"actual_size": len(data), "status": UploadStatus.UPLOADED.value}},
            )
        except FileNotFoundError:
            raise HTTPException(status_code=400, detail="File bytes not yet uploaded")

    now = _now_iso()
    await _collection().update_one(
        {"id": upload_id},
        {"$set": {
            "status": UploadStatus.PENDING_SCAN.value,
            "completed_at": now,
            "updated_at": now,
        }},
    )

    from services.background_jobs import schedule_tracked_job, tenant_id_from_user as tid_from_user
    from workers.scan_uploaded_file import scan_uploaded_file

    schedule_tracked_job(
        background_tasks,
        "scan_uploaded_file",
        scan_uploaded_file,
        file_id=upload_id,
        user_id=user.get("id"),
        tenant_id=tid_from_user(user),
        payload={"file_id": upload_id},
    )

    await log_upload_audit_event(
        EVENT_UPLOAD_COMPLETED,
        tenant_id=doc.get("tenant_id"),
        user_id=user.get("id"),
        file_id=upload_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
        file_size_bytes=doc.get("actual_size"),
    )

    return {
        "upload_id": upload_id,
        "file_id": upload_id,
        "status": UploadStatus.PENDING_SCAN.value,
    }


async def get_file_status(user: dict, file_id: str) -> dict:
    doc = await _get_file_doc(file_id, user)
    await assert_file_access(user, doc)

    return _public_file_view(doc)


async def get_download_url(user: dict, file_id: str) -> dict:
    doc = await _get_file_doc(file_id, user)
    await assert_file_access(user, doc)

    if doc["status"] != UploadStatus.AVAILABLE.value:
        raise HTTPException(
            status_code=403,
            detail="File is not available for download",
        )

    key = doc.get("safe_storage_key") or doc.get("storage_key")
    url = presigned_get_url(key)
    if not url:
        raise HTTPException(
            status_code=501,
            detail="Direct download URLs require R2 storage; use authenticated download endpoint",
        )

    await log_upload_audit_event(
        EVENT_DOWNLOAD_REQUESTED,
        tenant_id=doc.get("tenant_id"),
        user_id=user.get("id"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
    )

    return {
        "file_id": file_id,
        "download_url": url,
        "expires_in_seconds": SIGNED_URL_EXPIRY_SECONDS,
        "filename": doc.get("original_filename"),
        "content_type": doc.get("content_type"),
    }


async def delete_file(user: dict, file_id: str) -> dict:
    doc = await _get_file_doc(file_id, user)
    await assert_file_access(user, doc, require_write=True)

    for key in (doc.get("safe_storage_key"), doc.get("storage_key"), doc.get("quarantine_storage_key")):
        if key:
            try:
                await remove_object(key)
            except Exception as exc:
                logger.warning("Failed to delete storage key %s: %s", key, exc)

    now = _now_iso()
    await _collection().update_one(
        {"id": file_id},
        {"$set": {"status": UploadStatus.DELETED.value, "updated_at": now, "deleted_at": now}},
    )

    await log_upload_audit_event(
        "file_deleted",
        tenant_id=doc.get("tenant_id"),
        user_id=user.get("id"),
        file_id=file_id,
    )

    return {"file_id": file_id, "status": UploadStatus.DELETED.value}


def _public_file_view(doc: dict) -> Dict[str, Any]:
    return {
        "file_id": doc["id"],
        "upload_id": doc.get("upload_id", doc["id"]),
        "status": doc["status"],
        "original_filename": doc.get("original_filename"),
        "content_type": doc.get("content_type"),
        "declared_size": doc.get("declared_size"),
        "actual_size": doc.get("actual_size"),
        "linked_entity_type": doc.get("linked_entity_type"),
        "linked_entity_id": doc.get("linked_entity_id"),
        "rejection_reason": doc.get("rejection_reason"),
        "user_message": doc.get("user_message") or (
            USER_REJECTION_MESSAGE if doc.get("status") in {
                UploadStatus.REJECTED.value,
                UploadStatus.QUARANTINED.value,
            } else None
        ),
        "malware_scan_result": doc.get("malware_scan_result"),
        "sanitized": doc.get("sanitized"),
        "content_validation_result": doc.get("content_validation_result"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "scan_completed_at": doc.get("scan_completed_at"),
        "presigned_upload_supported": supports_presigned_upload(),
    }
