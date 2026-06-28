"""
Secure file upload pipeline configuration.
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, FrozenSet, List


class UploadStatus(str, Enum):
    INITIATED = "initiated"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    PENDING_SCAN = "pending_scan"
    SCANNING = "scanning"
    PROCESSING = "processing"
    AVAILABLE = "available"
    REJECTED = "rejected"
    QUARANTINED = "quarantined"
    DELETED = "deleted"


class LinkedEntityType(str, Enum):
    OBSERVATION = "observation"
    INVESTIGATION = "investigation"
    EQUIPMENT = "equipment"
    ACTION = "action"
    MAINTENANCE_PROGRAM = "maintenance_program"
    FORM_SUBMISSION = "form_submission"
    PM_IMPORT = "pm_import"
    DOCUMENT_LIBRARY = "document_library"


# Spec §5 — allowed by default
ALLOWED_EXTENSIONS: FrozenSet[str] = frozenset({
    "jpg", "jpeg", "png", "webp",
    "pdf",
    "xlsx", "csv",
})

# Spec §5 — rejected by default (includes macro-enabled Office, archives, scripts)
REJECTED_EXTENSIONS: FrozenSet[str] = frozenset({
    "exe", "dll", "bat", "cmd", "sh", "js", "html", "htm", "svg",
    "iso", "zip", "rar", "7z",
    "xls", "xlsm", "xltm", "pptm", "docm",
    "com", "scr", "ps1", "bash", "msi", "vbs", "mjs", "jar", "php",
    "asp", "aspx", "swf", "reg", "inf", "hta", "cpl", "wsf", "wsh",
    "doc", "docx", "gif", "heic", "txt", "json", "mp4", "mp3", "wav",
})

ALLOWED_MIME_TYPES: Dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv",
}

# Spec §6 — size limits (bytes)
MAX_SIZE_BY_TYPE: Dict[str, int] = {
    "default": 10 * 1024 * 1024,
    "image": 10 * 1024 * 1024,
    "pdf": 25 * 1024 * 1024,
    "xlsx": 15 * 1024 * 1024,
    "csv": 10 * 1024 * 1024,
    "equipment_manual": 100 * 1024 * 1024,
}

LINKED_ENTITY_TYPES: List[str] = [t.value for t in LinkedEntityType]

SIGNED_URL_EXPIRY_SECONDS = 300
SCAN_TIMEOUT_SECONDS = 60
SCAN_RETRY_COUNT = 3
QUARANTINE_RETENTION_DAYS = 30
TEMP_RETENTION_HOURS = 2

USER_REJECTION_MESSAGE = (
    "This file could not be accepted because it failed security validation."
)

STORAGE_PREFIX_TEMP = "uploads-temp/"
STORAGE_PREFIX_SAFE = "uploads-safe/"
STORAGE_PREFIX_QUARANTINE = "uploads-quarantine/"

FILE_UPLOAD_CONFIG = {
    "allowed_extensions": sorted(ALLOWED_EXTENSIONS),
    "rejected_extensions": sorted(REJECTED_EXTENSIONS),
    "allowed_mime_types": ALLOWED_MIME_TYPES,
    "max_size_by_type": MAX_SIZE_BY_TYPE,
    "statuses": [s.value for s in UploadStatus],
    "linked_entity_types": LINKED_ENTITY_TYPES,
    "signed_url_expiry_seconds": SIGNED_URL_EXPIRY_SECONDS,
    "scan_timeout_seconds": SCAN_TIMEOUT_SECONDS,
    "scan_retry_count": SCAN_RETRY_COUNT,
    "quarantine_retention_days": QUARANTINE_RETENTION_DAYS,
    "temp_retention_hours": TEMP_RETENTION_HOURS,
    "user_rejection_message": USER_REJECTION_MESSAGE,
    "enable_image_reencoding": True,
    "enable_pdf_validation": True,
    "enable_pdf_sanitization": False,
    "enable_excel_macro_detection": True,
    "storage_prefixes": {
        "temp": STORAGE_PREFIX_TEMP,
        "safe": STORAGE_PREFIX_SAFE,
        "quarantine": STORAGE_PREFIX_QUARANTINE,
    },
}
