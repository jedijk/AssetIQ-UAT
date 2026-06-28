"""
Phase 3 — content-specific validation and sanitization.

- Images: decode, strip EXIF, re-encode
- PDF: structural validation, reject dangerous active content
- XLSX: macro / external link detection (values only, no formula eval)
- CSV: encoding + formula-injection neutralization for export contexts
"""
from __future__ import annotations

import io
import logging
import zipfile
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from config.file_upload_config import FILE_UPLOAD_CONFIG

logger = logging.getLogger(__name__)

_IMAGE_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "webp"})


@dataclass
class ContentProcessResult:
    ok: bool
    data: bytes
    content_type: str
    sanitized: bool = False
    reason: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


def process_upload_content(
    extension: str,
    content_type: str,
    data: bytes,
    *,
    filename: str = "",
) -> ContentProcessResult:
    """Run type-specific processing after malware scan and magic-byte checks."""
    ext = extension.lower().lstrip(".")

    if ext in _IMAGE_EXTENSIONS and FILE_UPLOAD_CONFIG.get("enable_image_reencoding", True):
        return _process_image(ext, content_type, data)

    if ext == "pdf" and FILE_UPLOAD_CONFIG.get("enable_pdf_validation", True):
        return _validate_pdf(content_type, data)

    if ext == "xlsx" and FILE_UPLOAD_CONFIG.get("enable_excel_macro_detection", True):
        return _validate_xlsx(content_type, data)

    if ext == "csv":
        return _validate_csv(content_type, data)

    return ContentProcessResult(ok=True, data=data, content_type=content_type, sanitized=False)


def _process_image(ext: str, content_type: str, data: bytes) -> ContentProcessResult:
    try:
        from PIL import Image, ImageOps
    except ImportError:
        logger.warning("Pillow not available — skipping image re-encode")
        return ContentProcessResult(ok=True, data=data, content_type=content_type, sanitized=False)

    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception as exc:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason=f"Image could not be decoded: {exc}",
            details={"stage": "image_decode"},
        )

    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)

        if ext in {"jpg", "jpeg"}:
            out_fmt, out_ct = "JPEG", "image/jpeg"
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            elif img.mode != "RGB":
                img = img.convert("RGB")
        elif ext == "webp":
            out_fmt, out_ct = "WEBP", "image/webp"
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.mode else "RGB")
        else:
            out_fmt, out_ct = "PNG", "image/png"
            if img.mode == "P":
                img = img.convert("RGBA")

        buf = io.BytesIO()
        save_kwargs: Dict[str, Any] = {"format": out_fmt, "optimize": True}
        if out_fmt == "JPEG":
            save_kwargs["quality"] = 85
        img.save(buf, **save_kwargs)
        sanitized = buf.getvalue()

        return ContentProcessResult(
            ok=True,
            data=sanitized,
            content_type=out_ct,
            sanitized=True,
            details={"stage": "image_reencode", "original_bytes": len(data), "sanitized_bytes": len(sanitized)},
        )
    except Exception as exc:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason=f"Image sanitization failed: {exc}",
            details={"stage": "image_reencode"},
        )


def _validate_pdf(content_type: str, data: bytes) -> ContentProcessResult:
    """Structural PDF validation — reject encrypted, JS, launch, embedded files."""
    details: Dict[str, Any] = {"stage": "pdf_validation"}

    # Fast byte-level checks for dangerous markers
    sample = data[: min(len(data), 512_000)]
    lower_sample = sample.lower()
    dangerous_markers = (
        b"/javascript",
        b"/js ",
        b"/launch",
        b"/embeddedfile",
        b"/openaction",
    )
    for marker in dangerous_markers:
        if marker in lower_sample:
            return ContentProcessResult(
                ok=False,
                data=data,
                content_type=content_type,
                reason="PDF contains prohibited active or embedded content",
                details={**details, "marker": marker.decode("utf-8", errors="replace")},
            )

    # PyMuPDF structural open
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=data, filetype="pdf")
        try:
            if doc.is_encrypted or doc.needs_pass:
                return ContentProcessResult(
                    ok=False,
                    data=data,
                    content_type=content_type,
                    reason="Encrypted PDFs are not supported",
                    details=details,
                )
            if doc.page_count < 1:
                return ContentProcessResult(
                    ok=False,
                    data=data,
                    content_type=content_type,
                    reason="PDF has no readable pages",
                    details=details,
                )
            if doc.embfile_count() > 0:
                return ContentProcessResult(
                    ok=False,
                    data=data,
                    content_type=content_type,
                    reason="PDF contains embedded files",
                    details={**details, "embedded_count": doc.embfile_count()},
                )
        finally:
            doc.close()
    except Exception as exc:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason=f"PDF could not be parsed: {exc}",
            details=details,
        )

    # pdfplumber secondary parse (soft — PyMuPDF is authoritative for Phase 3)
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if not pdf.pages:
                return ContentProcessResult(
                    ok=False,
                    data=data,
                    content_type=content_type,
                    reason="PDF has no readable pages",
                    details=details,
                )
    except Exception as exc:
        logger.warning("pdfplumber secondary parse skipped: %s", exc)
        details["pdfplumber_warning"] = str(exc)

    # No PDF sanitizer in Phase 3 — store original after validation
    return ContentProcessResult(
        ok=True,
        data=data,
        content_type=content_type,
        sanitized=False,
        details={**details, "sanitizer": "none"},
    )


def _validate_xlsx(content_type: str, data: bytes) -> ContentProcessResult:
    details: Dict[str, Any] = {"stage": "xlsx_validation"}

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = zf.namelist()
            macro_markers = (
                "xl/vbaProject.bin",
                "xl/macrosheets/",
                "xl/activeX/",
            )
            for name in names:
                lower = name.lower()
                if any(m in lower for m in macro_markers) or "vba" in lower:
                    return ContentProcessResult(
                        ok=False,
                        data=data,
                        content_type=content_type,
                        reason="Excel file contains macros or active content",
                        details={**details, "zip_entry": name},
                    )
                if lower.startswith("xl/externallinks/"):
                    return ContentProcessResult(
                        ok=False,
                        data=data,
                        content_type=content_type,
                        reason="Excel file contains external workbook links",
                        details={**details, "zip_entry": name},
                    )
    except zipfile.BadZipFile:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason="Invalid XLSX file structure",
            details=details,
        )

    try:
        import openpyxl

        wb = openpyxl.load_workbook(
            io.BytesIO(data),
            read_only=True,
            data_only=True,
            keep_links=False,
        )
        try:
            if getattr(wb, "vba_archive", None):
                return ContentProcessResult(
                    ok=False,
                    data=data,
                    content_type=content_type,
                    reason="Excel file contains VBA macros",
                    details=details,
                )
            # Scan first sheet rows for external link formulas (lightweight)
            for sheet in wb.worksheets:
                for row in sheet.iter_rows(max_row=50, max_col=20, values_only=True):
                    for cell in row:
                        if isinstance(cell, str) and cell.startswith("[") and "]" in cell:
                            return ContentProcessResult(
                                ok=False,
                                data=data,
                                content_type=content_type,
                                reason="Excel file contains external workbook references",
                                details=details,
                            )
        finally:
            wb.close()
    except Exception as exc:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason=f"Excel file could not be parsed safely: {exc}",
            details=details,
        )

    return ContentProcessResult(ok=True, data=data, content_type=content_type, sanitized=False, details=details)


def _validate_csv(content_type: str, data: bytes) -> ContentProcessResult:
    details: Dict[str, Any] = {"stage": "csv_validation"}

    if len(data) > FILE_UPLOAD_CONFIG.get("max_size_by_type", {}).get("csv", 10 * 1024 * 1024):
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason="CSV file exceeds size limit",
            details=details,
        )

    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            text = None
    if text is None:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason="CSV encoding could not be determined",
            details=details,
        )

    lines = text.splitlines()
    if len(lines) > 100_000:
        return ContentProcessResult(
            ok=False,
            data=data,
            content_type=content_type,
            reason="CSV exceeds maximum row count",
            details=details,
        )

    max_cell = 32_768
    for line in lines[:5000]:
        if len(line) > max_cell:
            return ContentProcessResult(
                ok=False,
                data=data,
                content_type=content_type,
                reason="CSV contains oversized cell content",
                details=details,
            )

    # Neutralize formula injection markers per cell (spec §17)
    import csv

    reader = csv.reader(io.StringIO(text))
    out_buf = io.StringIO()
    writer = csv.writer(out_buf, lineterminator="\n")
    injection_prefixes = ("=", "+", "-", "@")
    changed = False
    for row in reader:
        sanitized_row = []
        for cell in row:
            check = cell.lstrip("\t\r ")
            if check and check[0] in injection_prefixes:
                sanitized_row.append("'" + cell)
                changed = True
            else:
                sanitized_row.append(cell)
        writer.writerow(sanitized_row)

    out = out_buf.getvalue()
    if text.endswith("\n") and not out.endswith("\n"):
        out += "\n"
    out_bytes = out.encode("utf-8")

    return ContentProcessResult(
        ok=True,
        data=out_bytes,
        content_type="text/csv",
        sanitized=changed,
        details={**details, "formula_cells_neutralized": changed},
    )
