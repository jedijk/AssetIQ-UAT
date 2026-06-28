"""
Phase 4 — preview thumbnail generation for trusted upload types.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Optional

from config.file_upload_config import FILE_UPLOAD_CONFIG, TRUSTED_PREVIEW_TYPES

logger = logging.getLogger(__name__)

_IMAGE_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "webp"})
_PREVIEW_CONTENT_TYPE = "image/png"


@dataclass
class PreviewResult:
    ok: bool
    data: Optional[bytes] = None
    content_type: Optional[str] = None
    reason: Optional[str] = None


def generate_preview(extension: str, content_type: str, data: bytes) -> PreviewResult:
    """Generate a PNG preview thumbnail when supported."""
    if not FILE_UPLOAD_CONFIG.get("enable_preview_generation", True):
        return PreviewResult(ok=False, reason="Preview generation disabled")

    ext = extension.lower().lstrip(".")
    if ext not in TRUSTED_PREVIEW_TYPES:
        return PreviewResult(ok=False, reason=f"No preview for extension: {ext}")

    if ext in _IMAGE_EXTENSIONS:
        return _preview_image(data)
    if ext == "pdf":
        return _preview_pdf(data)

    return PreviewResult(ok=False, reason=f"No preview for extension: {ext}")


def _preview_image(data: bytes) -> PreviewResult:
    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow not available — skipping image preview")
        return PreviewResult(ok=False, reason="Pillow not available")

    max_dim = int(FILE_UPLOAD_CONFIG.get("preview_max_dimension", 400))
    try:
        img = Image.open(io.BytesIO(data))
        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        return PreviewResult(ok=True, data=out.getvalue(), content_type=_PREVIEW_CONTENT_TYPE)
    except Exception as exc:
        logger.warning("Image preview generation failed: %s", exc)
        return PreviewResult(ok=False, reason=str(exc))


def _preview_pdf(data: bytes) -> PreviewResult:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.info("PyMuPDF not available — skipping PDF preview")
        return PreviewResult(ok=False, reason="PyMuPDF not available")

    max_dim = int(FILE_UPLOAD_CONFIG.get("preview_max_dimension", 400))
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.page_count < 1:
            doc.close()
            return PreviewResult(ok=False, reason="PDF has no pages")
        page = doc.load_page(0)
        rect = page.rect
        scale = min(max_dim / max(rect.width, 1), max_dim / max(rect.height, 1), 2.0)
        matrix = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        png_bytes = pix.tobytes("png")
        doc.close()
        return PreviewResult(ok=True, data=png_bytes, content_type=_PREVIEW_CONTENT_TYPE)
    except Exception as exc:
        logger.warning("PDF preview generation failed: %s", exc)
        return PreviewResult(ok=False, reason=str(exc))
