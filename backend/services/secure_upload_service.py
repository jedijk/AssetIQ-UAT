"""
Secure file upload orchestration service.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, HTTPException

from config.file_upload_config import (
    UploadStatus,
    USER_REJECTION_MESSAGE,
    SIGNED_URL_EXPIRY_SECONDS,
    is_secure_upload_enabled,
    is_secure_upload_fast_path,
    get_public_upload_config,
)
from database import db
from services.secure_upload_access import assert_entity_access, assert_file_access
from services.secure_upload_audit import (
    EVENT_AVAILABLE,
    EVENT_DOWNLOAD_REQUESTED,
    EVENT_PREVIEW_REQUESTED,
    EVENT_RESCAN_REQUESTED,
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
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, with_tenant_id

from services.secure_upload_validation import (
    normalize_extension,
    validate_file_content,
    validate_upload_metadata,
)

logger = logging.getLogger(__name__)

COLLECTION = "uploaded_files"
AUDIT_COLLECTION = "security_audit_log"
_ADMIN_ROLES = frozenset({"owner", "admin"})
_RESCAN_STATUSES = frozenset({
    UploadStatus.AVAILABLE.value,
    UploadStatus.QUARANTINED.value,
    UploadStatus.REJECTED.value,
})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def assert_secure_upload_enabled() -> None:
    if not is_secure_upload_enabled():
        raise HTTPException(
            status_code=503,
            detail="Secure file upload pipeline is disabled on this environment",
        )


def get_upload_config() -> dict:
    """Public effective configuration (no secrets)."""
    assert_secure_upload_enabled()
    return get_public_upload_config()


async def _promote_to_available(
    doc: dict,
    data: bytes,
    *,
    content_type: str,
    fast_path: bool = False,
) -> dict:
    """Move validated bytes to safe storage and mark file available."""
    tenant_id = doc.get("tenant_id") or "default"
    file_id = doc["id"]
    ext = doc.get("extension", "bin")
    dest = safe_key(tenant_id, file_id, ext)
    source_key = doc.get("storage_key")

    await store_bytes(dest, data, content_type)
    if source_key and source_key != dest:
        try:
            await remove_object(source_key)
        except Exception as exc:
            logger.warning("Failed to remove temp key %s: %s", source_key, exc)

    now = _now_iso()
    file_hash = hashlib.sha256(data).hexdigest()
    await _collection().update_one(
        {"id": file_id},
        {"$set": {
            "status": UploadStatus.AVAILABLE.value,
            "safe_storage_key": dest,
            "storage_key": dest,
            "detected_mime_type": content_type,
            "actual_size": len(data),
            "sha256_hash": file_hash,
            "sanitized": False,
            "content_validation_result": {"stage": "fast_path" if fast_path else "inline"},
            "scan_completed_at": now,
            "available_at": now,
            "updated_at": now,
            "preview_available": False,
            "preview_storage_key": None,
            "preview_content_type": None,
        }},
    )

    await log_upload_audit_event(
        EVENT_AVAILABLE,
        tenant_id=tenant_id,
        user_id=doc.get("uploaded_by"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
        file_size_bytes=len(data),
        detected_mime_type=content_type,
        sha256_hash=file_hash,
        details={"fast_path": fast_path},
    )

    return {
        "upload_id": file_id,
        "file_id": file_id,
        "status": UploadStatus.AVAILABLE.value,
    }


async def _complete_upload_fast_path(doc: dict) -> dict:
    """UAT/dev: skip async scan; inline magic-byte check then promote to available."""
    source_key = doc.get("storage_key")
    if not source_key:
        raise HTTPException(status_code=400, detail="File bytes not yet uploaded")

    try:
        data, _ = await fetch_bytes(source_key)
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail="File bytes not yet uploaded")

    validation = validate_file_content(
        doc.get("original_filename", "file.bin"),
        doc.get("content_type"),
        data,
    )
    if not validation.ok:
        now = _now_iso()
        await _collection().update_one(
            {"id": doc["id"]},
            {"$set": {
                "status": UploadStatus.REJECTED.value,
                "rejection_reason": validation.reason,
                "user_message": USER_REJECTION_MESSAGE,
                "updated_at": now,
            }},
        )
        raise HTTPException(status_code=400, detail=validation.reason)

    content_type = validation.detected_mime or doc.get("content_type") or "application/octet-stream"
    return await _promote_to_available(doc, data, content_type=content_type, fast_path=True)


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
    assert_secure_upload_enabled()
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
    assert_secure_upload_enabled()
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
    assert_secure_upload_enabled()
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
        {"$set": {"completed_at": now, "updated_at": now}},
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

    if is_secure_upload_fast_path():
        logger.info("SECURE_UPLOAD_FAST_PATH: promoting %s without async scan", upload_id)
        return await _complete_upload_fast_path(doc)

    await _collection().update_one(
        {"id": upload_id},
        {"$set": {"status": UploadStatus.PENDING_SCAN.value, "updated_at": _now_iso()}},
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

    return {
        "upload_id": upload_id,
        "file_id": upload_id,
        "status": UploadStatus.PENDING_SCAN.value,
    }


async def get_file_status(user: dict, file_id: str) -> dict:
    assert_secure_upload_enabled()
    doc = await _get_file_doc(file_id, user)
    await assert_file_access(user, doc)

    return _public_file_view(doc, user=user)


async def get_download_url(user: dict, file_id: str) -> dict:
    assert_secure_upload_enabled()
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


async def get_preview_url(user: dict, file_id: str) -> dict:
    assert_secure_upload_enabled()
    doc = await _get_file_doc(file_id, user)
    await assert_file_access(user, doc)

    if doc["status"] != UploadStatus.AVAILABLE.value:
        raise HTTPException(status_code=403, detail="File is not available for preview")

    if not doc.get("preview_available"):
        raise HTTPException(status_code=404, detail="Preview not available for this file")

    key = doc.get("preview_storage_key")
    if not key:
        raise HTTPException(status_code=404, detail="Preview not available for this file")

    url = presigned_get_url(key)
    if not url:
        raise HTTPException(
            status_code=501,
            detail="Preview URLs require R2 storage",
        )

    await log_upload_audit_event(
        EVENT_PREVIEW_REQUESTED,
        tenant_id=doc.get("tenant_id"),
        user_id=user.get("id"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
    )

    return {
        "file_id": file_id,
        "preview_url": url,
        "expires_in_seconds": SIGNED_URL_EXPIRY_SECONDS,
        "content_type": doc.get("preview_content_type") or "image/png",
    }


async def list_quarantined_files(
    user: dict,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    assert_secure_upload_enabled()
    _require_admin(user)
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    skip = (page - 1) * page_size

    query = merge_tenant_filter({"status": UploadStatus.QUARANTINED.value}, user)
    coll = _collection()
    total = await coll.count_documents(query)
    cursor = coll.find(query, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(page_size)
    items = [_admin_file_view(doc) async for doc in cursor]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_security_dashboard_stats(user: dict) -> dict:
    assert_secure_upload_enabled()
    _require_admin(user)
    tenant_filter = merge_tenant_filter({}, user)
    coll = _collection()

    pipeline = [
        {"$match": tenant_filter},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    status_counts: Dict[str, int] = {}
    async for row in coll.aggregate(pipeline):
        status_counts[row["_id"]] = row["count"]

    total_uploads = sum(status_counts.values())
    rejected = status_counts.get(UploadStatus.REJECTED.value, 0)
    quarantined = status_counts.get(UploadStatus.QUARANTINED.value, 0)
    available = status_counts.get(UploadStatus.AVAILABLE.value, 0)
    pending = sum(
        status_counts.get(s, 0)
        for s in (
            UploadStatus.PENDING_SCAN.value,
            UploadStatus.SCANNING.value,
            UploadStatus.PROCESSING.value,
            UploadStatus.UPLOADED.value,
            UploadStatus.INITIATED.value,
            UploadStatus.UPLOADING.value,
        )
    )

    rejection_rate = round(rejected / total_uploads, 4) if total_uploads else 0.0
    quarantine_rate = round(quarantined / total_uploads, 4) if total_uploads else 0.0

    audit_query = {
        "category": "secure_file_upload",
        **{k: v for k, v in tenant_filter.items()},
    }
    recent_events = []
    audit_coll = db[AUDIT_COLLECTION]
    try:
        cursor = audit_coll.find(audit_query, {"_id": 0}).sort("timestamp", -1).limit(25)
        recent_events = [doc async for doc in cursor]
    except Exception:
        audit_query.pop("category", None)
        audit_query["event"] = {"$regex": "^file_"}
        cursor = db.audit_log.find(audit_query, {"_id": 0}).sort("ts", -1).limit(25)
        async for doc in cursor:
            if "timestamp" not in doc and "ts" in doc:
                doc["timestamp"] = doc["ts"]
            recent_events.append(doc)

    return {
        "status_counts": status_counts,
        "summary": {
            "total": total_uploads,
            "available": available,
            "quarantined": quarantined,
            "rejected": rejected,
            "pending": pending,
            "rejection_rate": rejection_rate,
            "quarantine_rate": quarantine_rate,
        },
        "recent_events": recent_events,
        "config": get_public_upload_config(),
    }


async def request_rescan(user: dict, file_id: str, background_tasks: BackgroundTasks) -> dict:
    assert_secure_upload_enabled()
    _require_admin(user)
    doc = await _get_file_doc(file_id, user)

    if doc["status"] not in _RESCAN_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot re-scan file in status: {doc['status']}",
        )

    source_key = (
        doc.get("safe_storage_key")
        or doc.get("quarantine_storage_key")
        or doc.get("storage_key")
    )
    if not source_key:
        raise HTTPException(status_code=400, detail="No storage location for re-scan")

    now = _now_iso()
    await _collection().update_one(
        {"id": file_id},
        {"$set": {
            "status": UploadStatus.PENDING_SCAN.value,
            "storage_key": source_key,
            "scan_attempts": 0,
            "scan_started_at": None,
            "scan_completed_at": None,
            "preview_available": False,
            "preview_storage_key": None,
            "preview_content_type": None,
            "updated_at": now,
        }},
    )

    from services.background_jobs import schedule_tracked_job, tenant_id_from_user as tid_from_user
    from workers.scan_uploaded_file import scan_uploaded_file

    schedule_tracked_job(
        background_tasks,
        "scan_uploaded_file",
        scan_uploaded_file,
        file_id=file_id,
        user_id=user.get("id"),
        tenant_id=tid_from_user(user),
        payload={"file_id": file_id, "rescan": True},
    )

    await log_upload_audit_event(
        EVENT_RESCAN_REQUESTED,
        tenant_id=doc.get("tenant_id"),
        user_id=user.get("id"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
        details={"previous_status": doc["status"]},
    )

    return {
        "file_id": file_id,
        "status": UploadStatus.PENDING_SCAN.value,
    }


async def delete_file(user: dict, file_id: str) -> dict:
    assert_secure_upload_enabled()
    doc = await _get_file_doc(file_id, user)
    await assert_file_access(user, doc, require_write=True)

    for key in (
        doc.get("safe_storage_key"),
        doc.get("storage_key"),
        doc.get("quarantine_storage_key"),
        doc.get("preview_storage_key"),
    ):
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


def _require_admin(user: dict) -> None:
    if user.get("role") not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")


def _is_admin(user: Optional[dict]) -> bool:
    return bool(user and user.get("role") in _ADMIN_ROLES)


def _public_file_view(doc: dict, *, user: Optional[dict] = None) -> Dict[str, Any]:
    sensitive_status = doc.get("status") in {
        UploadStatus.REJECTED.value,
        UploadStatus.QUARANTINED.value,
    }
    show_technical = _is_admin(user) or not sensitive_status

    view: Dict[str, Any] = {
        "file_id": doc["id"],
        "upload_id": doc.get("upload_id", doc["id"]),
        "status": doc["status"],
        "original_filename": doc.get("original_filename"),
        "content_type": doc.get("content_type"),
        "declared_size": doc.get("declared_size"),
        "actual_size": doc.get("actual_size"),
        "linked_entity_type": doc.get("linked_entity_type"),
        "linked_entity_id": doc.get("linked_entity_id"),
        "user_message": doc.get("user_message") or (
            USER_REJECTION_MESSAGE if sensitive_status else None
        ),
        "sanitized": doc.get("sanitized"),
        "preview_available": bool(doc.get("preview_available")),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "scan_completed_at": doc.get("scan_completed_at"),
        "presigned_upload_supported": supports_presigned_upload(),
    }

    if show_technical:
        view["rejection_reason"] = doc.get("rejection_reason")
        view["malware_scan_result"] = doc.get("malware_scan_result")
        view["content_validation_result"] = doc.get("content_validation_result")

    return view


def _admin_file_view(doc: dict) -> Dict[str, Any]:
    return {
        "file_id": doc["id"],
        "status": doc.get("status"),
        "original_filename": doc.get("original_filename"),
        "content_type": doc.get("content_type"),
        "extension": doc.get("extension"),
        "uploaded_by": doc.get("uploaded_by"),
        "uploaded_by_name": doc.get("uploaded_by_name"),
        "linked_entity_type": doc.get("linked_entity_type"),
        "linked_entity_id": doc.get("linked_entity_id"),
        "rejection_reason": doc.get("rejection_reason"),
        "user_message": doc.get("user_message"),
        "malware_scan_result": doc.get("malware_scan_result"),
        "content_validation_result": doc.get("content_validation_result"),
        "sha256_hash": doc.get("sha256_hash"),
        "scan_attempts": doc.get("scan_attempts"),
        "scan_started_at": doc.get("scan_started_at"),
        "scan_completed_at": doc.get("scan_completed_at"),
        "quarantine_storage_key": doc.get("quarantine_storage_key"),
        "preview_available": bool(doc.get("preview_available")),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }
