"""
Pre-upload validation: extension, size, MIME, and magic-byte detection.
Uses built-in byte signatures only (no extra dependencies).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple

from config.file_upload_config import (
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES,
    MAX_SIZE_BY_TYPE,
    REJECTED_EXTENSIONS,
)

# Magic-byte signatures: (offset, bytes, detected_extension)
_MAGIC_SIGNATURES: Tuple[Tuple[int, bytes, str], ...] = (
    (0, b"\xff\xd8\xff", "jpg"),
    (0, b"\x89PNG\r\n\x1a\n", "png"),
    (0, b"GIF87a", "gif"),
    (0, b"GIF89a", "gif"),
    (0, b"%PDF", "pdf"),
    (0, b"PK\x03\x04", "zip"),  # docx/xlsx are zip-based
    (0, b"RIFF", "wav"),  # WAV/WEBP share RIFF; refined below
    (0, b"\x1a\x45\xdf\xa3", "webm"),  # not allowed but detectable
    (4, b"ftyp", "mp4"),
    (0, b"ID3", "mp3"),
    (0, b"\xff\xfb", "mp3"),
    (0, b"\xff\xf3", "mp3"),
    (0, b"\xff\xf2", "mp3"),
)

_IMAGE_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "gif", "webp", "heic"})
_DOCUMENT_EXTENSIONS = frozenset({"pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "json"})
_VIDEO_EXTENSIONS = frozenset({"mp4"})
_AUDIO_EXTENSIONS = frozenset({"mp3", "wav"})

_ZIP_OFFICE_EXTENSIONS = frozenset({"docx", "xlsx"})


@dataclass
class ValidationResult:
    ok: bool
    reason: Optional[str] = None
    detected_extension: Optional[str] = None
    detected_mime: Optional[str] = None


def normalize_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    ext = filename.rsplit(".", 1)[-1].lower().strip()
    return re.sub(r"[^a-z0-9]", "", ext)


def file_category(ext: str) -> str:
    if ext in _IMAGE_EXTENSIONS:
        return "image"
    if ext in _DOCUMENT_EXTENSIONS:
        return "document"
    if ext in _VIDEO_EXTENSIONS:
        return "video"
    if ext in _AUDIO_EXTENSIONS:
        return "audio"
    return "default"


def max_size_for_extension(ext: str) -> int:
    if ext == "pdf":
        return MAX_SIZE_BY_TYPE.get("pdf", MAX_SIZE_BY_TYPE["default"])
    if ext == "xlsx":
        return MAX_SIZE_BY_TYPE.get("xlsx", MAX_SIZE_BY_TYPE["default"])
    if ext == "csv":
        return MAX_SIZE_BY_TYPE.get("csv", MAX_SIZE_BY_TYPE["default"])
    category = file_category(ext)
    return MAX_SIZE_BY_TYPE.get(category, MAX_SIZE_BY_TYPE["default"])


def validate_extension(filename: str) -> ValidationResult:
    ext = normalize_extension(filename)
    if not ext:
        return ValidationResult(ok=False, reason="File must have a valid extension")
    if ext in REJECTED_EXTENSIONS:
        return ValidationResult(ok=False, reason=f"Extension '.{ext}' is not allowed for security reasons")
    if ext not in ALLOWED_EXTENSIONS:
        return ValidationResult(ok=False, reason=f"Extension '.{ext}' is not supported")
    return ValidationResult(ok=True, detected_extension=ext)


def validate_declared_mime(ext: str, content_type: Optional[str]) -> ValidationResult:
    if not content_type:
        return ValidationResult(ok=True, detected_extension=ext)
    expected = ALLOWED_MIME_TYPES.get(ext)
    if not expected:
        return ValidationResult(ok=True, detected_extension=ext)
    ct = content_type.split(";")[0].strip().lower()
    if ct == expected or ct == "application/octet-stream":
        return ValidationResult(ok=True, detected_extension=ext, detected_mime=ct)
    # Allow generic text for csv/txt
    if ext in {"csv", "txt"} and ct.startswith("text/"):
        return ValidationResult(ok=True, detected_extension=ext, detected_mime=ct)
    return ValidationResult(
        ok=False,
        reason=f"Content type '{content_type}' does not match expected type for .{ext}",
        detected_mime=ct,
    )


def validate_size(ext: str, size_bytes: int) -> ValidationResult:
    if size_bytes <= 0:
        return ValidationResult(ok=False, reason="File is empty")
    limit = max_size_for_extension(ext)
    if size_bytes > limit:
        mb = round(limit / (1024 * 1024), 1)
        return ValidationResult(ok=False, reason=f"File exceeds maximum size of {mb} MB")
    return ValidationResult(ok=True, detected_extension=ext)


def detect_magic_bytes(data: bytes) -> Optional[str]:
    """Return detected extension from content, or None if unknown."""
    if not data:
        return None

    # WEBP inside RIFF
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"

    for offset, sig, ext in _MAGIC_SIGNATURES:
        end = offset + len(sig)
        if len(data) >= end and data[offset:end] == sig:
            if ext == "zip":
                # Office Open XML — cannot distinguish docx vs xlsx from bytes alone
                return "zip"
            if ext == "wav" and len(data) >= 12 and data[8:12] == b"WEBP":
                return "webp"
            return ext

    # Plain text / JSON / CSV — no reliable magic bytes
    try:
        sample = data[:512].decode("utf-8")
        if sample.strip().startswith("{") or sample.strip().startswith("["):
            return "json"
        if all(c.isprintable() or c in "\r\n\t" for c in sample):
            return "txt"
    except UnicodeDecodeError:
        pass

    return None


def extensions_compatible(declared_ext: str, detected_ext: Optional[str]) -> bool:
    """Check declared extension matches detected content (extension spoof detection)."""
    if not detected_ext:
        # No magic bytes — allow text-like formats only
        return declared_ext in {"txt", "csv", "json"}
    if detected_ext == declared_ext:
        return True
    if declared_ext == "jpeg" and detected_ext == "jpg":
        return True
    if detected_ext == "zip" and declared_ext in _ZIP_OFFICE_EXTENSIONS:
        return True
    if detected_ext == "mp3" and declared_ext == "mp3":
        return True
    if detected_ext == "mp4" and declared_ext == "mp4":
        return True
    return False


def validate_upload_metadata(
    filename: str,
    content_type: Optional[str],
    declared_size: int,
) -> ValidationResult:
    ext_result = validate_extension(filename)
    if not ext_result.ok:
        return ext_result
    ext = ext_result.detected_extension or ""

    size_result = validate_size(ext, declared_size)
    if not size_result.ok:
        return size_result

    mime_result = validate_declared_mime(ext, content_type)
    if not mime_result.ok:
        return mime_result

    return ValidationResult(ok=True, detected_extension=ext, detected_mime=mime_result.detected_mime)


def validate_file_content(
    filename: str,
    content_type: Optional[str],
    data: bytes,
) -> ValidationResult:
    ext_result = validate_extension(filename)
    if not ext_result.ok:
        return ext_result
    ext = ext_result.detected_extension or ""

    size_result = validate_size(ext, len(data))
    if not size_result.ok:
        return size_result

    mime_result = validate_declared_mime(ext, content_type)
    if not mime_result.ok:
        return mime_result

    detected = detect_magic_bytes(data)
    if not extensions_compatible(ext, detected):
        return ValidationResult(
            ok=False,
            reason=(
                f"File content does not match the '.{ext}' extension"
                + (f" (detected: .{detected})" if detected else "")
            ),
            detected_extension=detected,
        )

    return ValidationResult(ok=True, detected_extension=ext, detected_mime=mime_result.detected_mime)
