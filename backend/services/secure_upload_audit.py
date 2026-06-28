"""Audit events for the secure file upload pipeline (spec §22)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database import db

# Canonical event names per functional spec
EVENT_UPLOAD_INITIATED = "file_upload_initiated"
EVENT_UPLOAD_COMPLETED = "file_upload_completed"
EVENT_SCAN_STARTED = "file_scan_started"
EVENT_SCAN_CLEAN = "file_scan_clean"
EVENT_SCAN_FAILED = "file_scan_failed"
EVENT_REJECTED = "file_rejected"
EVENT_QUARANTINED = "file_quarantined"
EVENT_AVAILABLE = "file_available"
EVENT_DOWNLOAD_REQUESTED = "file_download_requested"
EVENT_DELETED = "file_deleted"
EVENT_ACCESS_DENIED = "file_access_denied"
EVENT_RESCAN_REQUESTED = "file_rescan_requested"
EVENT_PREVIEW_REQUESTED = "file_preview_requested"


async def log_upload_audit_event(
    event: str,
    *,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    file_id: Optional[str] = None,
    linked_entity_type: Optional[str] = None,
    linked_entity_id: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    detected_mime_type: Optional[str] = None,
    sha256_hash: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    result: str = "success",
    reason: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """Write to security_audit_log for security-sensitive upload events."""
    doc = {
        "id": str(uuid.uuid4()),
        "event": event,
        "category": "secure_file_upload",
        "tenant_id": tenant_id,
        "user_id": user_id,
        "file_id": file_id,
        "linked_entity_type": linked_entity_type,
        "linked_entity_id": linked_entity_id,
        "file_size_bytes": file_size_bytes,
        "detected_mime_type": detected_mime_type,
        "sha256_hash": sha256_hash,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "result": result,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if details:
        doc["details"] = details
    try:
        await db.security_audit_log.insert_one(doc)
    except Exception:
        doc.pop("category", None)
        doc["ts"] = doc.pop("timestamp")
        await db.audit_log.insert_one(doc)
