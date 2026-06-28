"""
Secure file upload pipeline configuration.

Defaults are secure-on. Override via environment variables for UAT/dev tuning.

Master switches:
  SECURE_UPLOAD_ENABLED=false     — disable /files API (503)
  SECURE_UPLOAD_FAST_PATH=true    — skip async scan; inline promote to available

Feature toggles (true/false/1/0/yes/no):
  FILE_UPLOAD_ENABLE_MALWARE_SCAN
  FILE_UPLOAD_ENABLE_IMAGE_REENCODING
  FILE_UPLOAD_ENABLE_PDF_VALIDATION
  FILE_UPLOAD_ENABLE_PDF_SANITIZATION
  FILE_UPLOAD_ENABLE_EXCEL_MACRO_DETECTION
  FILE_UPLOAD_ENABLE_CSV_VALIDATION
  FILE_UPLOAD_ENABLE_PREVIEW_GENERATION

Malware (ClamAV): CLAMAV_HOST, CLAMAV_PORT — scan runs only when both
enable_malware_scan and CLAMAV_HOST are set.
"""
from __future__ import annotations

import os
from enum import Enum
from typing import Any, Dict, FrozenSet, List


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


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


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
STORAGE_PREFIX_PREVIEW = "uploads-preview/"

TRUSTED_PREVIEW_TYPES: FrozenSet[str] = frozenset({
    "jpg", "jpeg", "png", "webp", "pdf",
})

PREVIEW_MAX_DIMENSION = 400

# Environment-driven master + feature flags
SECURE_UPLOAD_ENABLED = _env_bool("SECURE_UPLOAD_ENABLED", True)
SECURE_UPLOAD_FAST_PATH = _env_bool("SECURE_UPLOAD_FAST_PATH", False)

FILE_UPLOAD_CONFIG: Dict[str, Any] = {
    "secure_upload_enabled": SECURE_UPLOAD_ENABLED,
    "secure_upload_fast_path": SECURE_UPLOAD_FAST_PATH,
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
    "enable_malware_scan": _env_bool("FILE_UPLOAD_ENABLE_MALWARE_SCAN", True),
    "enable_image_reencoding": _env_bool("FILE_UPLOAD_ENABLE_IMAGE_REENCODING", True),
    "enable_pdf_validation": _env_bool("FILE_UPLOAD_ENABLE_PDF_VALIDATION", True),
    "enable_pdf_sanitization": _env_bool("FILE_UPLOAD_ENABLE_PDF_SANITIZATION", False),
    "enable_excel_macro_detection": _env_bool("FILE_UPLOAD_ENABLE_EXCEL_MACRO_DETECTION", True),
    "enable_csv_validation": _env_bool("FILE_UPLOAD_ENABLE_CSV_VALIDATION", True),
    "enable_preview_generation": _env_bool("FILE_UPLOAD_ENABLE_PREVIEW_GENERATION", True),
    "storage_prefixes": {
        "temp": STORAGE_PREFIX_TEMP,
        "safe": STORAGE_PREFIX_SAFE,
        "quarantine": STORAGE_PREFIX_QUARANTINE,
        "preview": STORAGE_PREFIX_PREVIEW,
    },
    "preview_max_dimension": PREVIEW_MAX_DIMENSION,
    "trusted_preview_types": sorted(TRUSTED_PREVIEW_TYPES),
}


def is_secure_upload_enabled() -> bool:
    return bool(FILE_UPLOAD_CONFIG.get("secure_upload_enabled", True))


def is_secure_upload_fast_path() -> bool:
    return bool(FILE_UPLOAD_CONFIG.get("secure_upload_fast_path", False))


def is_malware_scan_enabled() -> bool:
    return bool(FILE_UPLOAD_CONFIG.get("enable_malware_scan", True))


def get_public_upload_config() -> Dict[str, Any]:
    """Effective flags safe to expose to authenticated clients (no secrets)."""
    clamav_configured = bool(os.environ.get("CLAMAV_HOST", "").strip())
    return {
        "enabled": is_secure_upload_enabled(),
        "fast_path": is_secure_upload_fast_path(),
        "enable_malware_scan": is_malware_scan_enabled(),
        "clamav_configured": clamav_configured,
        "malware_scan_active": is_malware_scan_enabled() and clamav_configured,
        "enable_image_reencoding": FILE_UPLOAD_CONFIG.get("enable_image_reencoding"),
        "enable_pdf_validation": FILE_UPLOAD_CONFIG.get("enable_pdf_validation"),
        "enable_excel_macro_detection": FILE_UPLOAD_CONFIG.get("enable_excel_macro_detection"),
        "enable_csv_validation": FILE_UPLOAD_CONFIG.get("enable_csv_validation"),
        "enable_preview_generation": FILE_UPLOAD_CONFIG.get("enable_preview_generation"),
        "allowed_extensions": FILE_UPLOAD_CONFIG.get("allowed_extensions"),
        "max_size_by_type": FILE_UPLOAD_CONFIG.get("max_size_by_type"),
    }
