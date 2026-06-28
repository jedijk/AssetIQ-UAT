"""
Background scan worker — Phase 2: malware scan, quarantine, retries, audit.
Runs asynchronously — does NOT block the HTTP upload path.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from config.file_upload_config import FILE_UPLOAD_CONFIG, UploadStatus, USER_REJECTION_MESSAGE
from database import db
from services.secure_upload_audit import (
    EVENT_AVAILABLE,
    EVENT_QUARANTINED,
    EVENT_REJECTED,
    EVENT_SCAN_CLEAN,
    EVENT_SCAN_FAILED,
    EVENT_SCAN_STARTED,
    log_upload_audit_event,
)
from services.secure_upload_malware import MalwareScanResult, scan_bytes
from services.secure_upload_content import process_upload_content
from services.secure_upload_preview import generate_preview
from services.secure_upload_storage import (
    fetch_bytes,
    move_object,
    preview_key,
    quarantine_key,
    remove_object,
    safe_key,
    store_bytes,
)
from services.secure_upload_validation import validate_file_content

logger = logging.getLogger(__name__)

COLLECTION = "uploaded_files"
_SCAN_RETRY_COUNT = int(FILE_UPLOAD_CONFIG.get("scan_retry_count", 3))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def scan_uploaded_file(file_id: str, **_: Any) -> Dict[str, Any]:
    """Background worker entry point."""
    doc = await db[COLLECTION].find_one({"id": file_id}, {"_id": 0})
    if not doc:
        logger.warning("scan_uploaded_file: file not found %s", file_id)
        return {"status": "not_found", "file_id": file_id}

    allowed_entry = {
        UploadStatus.PENDING_SCAN.value,
        UploadStatus.SCANNING.value,
        UploadStatus.UPLOADED.value,
    }
    if doc.get("status") not in allowed_entry:
        return {"status": "skipped", "file_id": file_id, "reason": doc.get("status")}

    tenant_id = doc.get("tenant_id") or "default"
    ext = doc.get("extension", "bin")
    content_type = doc.get("content_type", "application/octet-stream")
    source_key = doc.get("storage_key")
    scan_attempt = int(doc.get("scan_attempts") or 0) + 1

    await db[COLLECTION].update_one(
        {"id": file_id},
        {"$set": {
            "status": UploadStatus.SCANNING.value,
            "scan_attempts": scan_attempt,
            "scan_started_at": _now_iso(),
            "updated_at": _now_iso(),
        }},
    )

    await log_upload_audit_event(
        EVENT_SCAN_STARTED,
        tenant_id=tenant_id,
        user_id=doc.get("uploaded_by"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
    )

    try:
        data, _ = await fetch_bytes(source_key)
    except FileNotFoundError:
        return await _reject(doc, "File data not found in storage", internal_reason="missing_data")

    file_hash = _sha256(data)
    await db[COLLECTION].update_one({"id": file_id}, {"$set": {"sha256_hash": file_hash}})

    # Re-check size after upload
    if len(data) > 100 * 1024 * 1024:
        return await _quarantine_or_reject(
            doc, data, content_type, ext, source_key,
            reason="File exceeds maximum allowed size after upload",
            user_message=USER_REJECTION_MESSAGE,
            malware_result="error",
        )

    # Malware scan
    malware = scan_bytes(data)
    await db[COLLECTION].update_one(
        {"id": file_id},
        {"$set": {"malware_scan_result": malware.result.value, "updated_at": _now_iso()}},
    )

    if malware.result == MalwareScanResult.INFECTED:
        await log_upload_audit_event(
            EVENT_SCAN_FAILED,
            tenant_id=tenant_id,
            user_id=doc.get("uploaded_by"),
            file_id=file_id,
            result="failure",
            reason=malware.signature or "malware detected",
            sha256_hash=file_hash,
        )
        return await _quarantine_or_reject(
            doc, data, content_type, ext, source_key,
            reason=f"Malware detected: {malware.signature or 'unknown'}",
            user_message=USER_REJECTION_MESSAGE,
            malware_result=malware.result.value,
            quarantine=True,
        )

    if malware.result in {MalwareScanResult.ERROR, MalwareScanResult.TIMEOUT}:
        if scan_attempt < _SCAN_RETRY_COUNT:
            await db[COLLECTION].update_one(
                {"id": file_id},
                {"$set": {
                    "status": UploadStatus.PENDING_SCAN.value,
                    "updated_at": _now_iso(),
                }},
            )
            await log_upload_audit_event(
                EVENT_SCAN_FAILED,
                tenant_id=tenant_id,
                user_id=doc.get("uploaded_by"),
                file_id=file_id,
                result="retry",
                reason=malware.detail,
                details={"attempt": scan_attempt, "max_retries": _SCAN_RETRY_COUNT},
            )
            return {
                "status": UploadStatus.PENDING_SCAN.value,
                "file_id": file_id,
                "retry": True,
                "attempt": scan_attempt,
            }

        await log_upload_audit_event(
            EVENT_SCAN_FAILED,
            tenant_id=tenant_id,
            user_id=doc.get("uploaded_by"),
            file_id=file_id,
            result="failure",
            reason=malware.detail or malware.result.value,
        )
        return await _quarantine_or_reject(
            doc, data, content_type, ext, source_key,
            reason=malware.detail or "Malware scan failed repeatedly",
            user_message=USER_REJECTION_MESSAGE,
            malware_result=malware.result.value,
            quarantine=True,
        )

    if malware.result == MalwareScanResult.CLEAN:
        await log_upload_audit_event(
            EVENT_SCAN_CLEAN,
            tenant_id=tenant_id,
            user_id=doc.get("uploaded_by"),
            file_id=file_id,
            sha256_hash=file_hash,
        )

    # Structural / magic-byte validation
    await db[COLLECTION].update_one(
        {"id": file_id},
        {"$set": {"status": UploadStatus.PROCESSING.value, "updated_at": _now_iso()}},
    )

    validation = validate_file_content(
        doc.get("original_filename", f"file.{ext}"),
        content_type,
        data,
    )

    if not validation.ok:
        return await _quarantine_or_reject(
            doc, data, content_type, ext, source_key,
            reason=validation.reason or "Content validation failed",
            user_message=USER_REJECTION_MESSAGE,
            malware_result=malware.result.value,
            quarantine="extension" not in (validation.reason or "").lower(),
        )

    # Phase 3 — type-specific sanitization / deep validation
    content_result = process_upload_content(
        ext,
        validation.detected_mime or content_type,
        data,
        filename=doc.get("original_filename", f"file.{ext}"),
    )

    if not content_result.ok:
        return await _quarantine_or_reject(
            doc, data, content_type, ext, source_key,
            reason=content_result.reason or "Content processing failed",
            user_message=USER_REJECTION_MESSAGE,
            malware_result=malware.result.value,
            quarantine=True,
        )

    final_data = content_result.data
    final_content_type = content_result.content_type
    final_hash = _sha256(final_data)

    dest = safe_key(tenant_id, file_id, ext)
    try:
        await store_bytes(dest, final_data, final_content_type)
        if source_key and source_key != dest:
            await remove_object(source_key)
    except Exception as exc:
        logger.error("Failed to store sanitized file %s: %s", file_id, exc)
        return await _reject(doc, USER_REJECTION_MESSAGE, internal_reason=str(exc))

    now = _now_iso()
    update_fields: Dict[str, Any] = {
        "status": UploadStatus.AVAILABLE.value,
        "safe_storage_key": dest,
        "storage_key": dest,
        "detected_mime_type": final_content_type,
        "actual_size": len(final_data),
        "sha256_hash": final_hash,
        "sanitized": content_result.sanitized,
        "content_validation_result": content_result.details,
        "scan_completed_at": now,
        "available_at": now,
        "updated_at": now,
        "rejection_reason": None,
        "user_message": None,
        "preview_available": False,
        "preview_storage_key": None,
        "preview_content_type": None,
    }

    if FILE_UPLOAD_CONFIG.get("enable_preview_generation", True):
        preview = generate_preview(ext, final_content_type, final_data)
        if preview.ok and preview.data:
            pkey = preview_key(tenant_id, file_id)
            try:
                await store_bytes(pkey, preview.data, preview.content_type or "image/png")
                update_fields["preview_available"] = True
                update_fields["preview_storage_key"] = pkey
                update_fields["preview_content_type"] = preview.content_type or "image/png"
            except Exception as exc:
                logger.warning("Failed to store preview for %s: %s", file_id, exc)

    await db[COLLECTION].update_one(
        {"id": file_id},
        {"$set": update_fields},
    )

    await log_upload_audit_event(
        EVENT_AVAILABLE,
        tenant_id=tenant_id,
        user_id=doc.get("uploaded_by"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
        file_size_bytes=len(final_data),
        detected_mime_type=final_content_type,
        sha256_hash=final_hash,
        details={
            "malware_scan_result": malware.result.value,
            "sanitized": content_result.sanitized,
            "content_validation": content_result.details,
        },
    )

    return {"status": UploadStatus.AVAILABLE.value, "file_id": file_id}


async def _quarantine_or_reject(
    doc: dict,
    data: bytes,
    content_type: str,
    ext: str,
    source_key: str,
    *,
    reason: str,
    user_message: str,
    malware_result: str,
    quarantine: bool = False,
) -> Dict[str, Any]:
    tenant_id = doc.get("tenant_id") or "default"
    file_id = doc["id"]
    dest = quarantine_key(tenant_id, file_id, ext) if quarantine else source_key

    if quarantine and source_key:
        try:
            await move_object(source_key, dest, content_type)
        except Exception as exc:
            logger.error("Failed to quarantine file %s: %s", file_id, exc)

    status = UploadStatus.QUARANTINED.value if quarantine else UploadStatus.REJECTED.value
    now = _now_iso()

    await db[COLLECTION].update_one(
        {"id": file_id},
        {"$set": {
            "status": status,
            "rejection_reason": reason,
            "user_message": user_message,
            "quarantine_storage_key": dest if quarantine else None,
            "malware_scan_result": malware_result,
            "scan_completed_at": now,
            "updated_at": now,
        }},
    )

    event = EVENT_QUARANTINED if quarantine else EVENT_REJECTED
    await log_upload_audit_event(
        event,
        tenant_id=tenant_id,
        user_id=doc.get("uploaded_by"),
        file_id=file_id,
        linked_entity_type=doc.get("linked_entity_type"),
        linked_entity_id=doc.get("linked_entity_id"),
        file_size_bytes=len(data),
        result="failure",
        reason=reason,
    )

    return {"status": status, "file_id": file_id, "reason": reason}


async def _reject(doc: dict, user_message: str, *, internal_reason: str) -> Dict[str, Any]:
    now = _now_iso()
    await db[COLLECTION].update_one(
        {"id": doc["id"]},
        {"$set": {
            "status": UploadStatus.REJECTED.value,
            "rejection_reason": internal_reason,
            "user_message": user_message,
            "scan_completed_at": now,
            "updated_at": now,
        }},
    )
    await log_upload_audit_event(
        EVENT_REJECTED,
        tenant_id=doc.get("tenant_id"),
        user_id=doc.get("uploaded_by"),
        file_id=doc["id"],
        result="failure",
        reason=internal_reason,
    )
    return {"status": UploadStatus.REJECTED.value, "file_id": doc["id"], "reason": internal_reason}
