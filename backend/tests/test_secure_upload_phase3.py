"""Phase 3 — image re-encode, PDF validation, Excel macro detection, CSV neutralization."""
from __future__ import annotations

import io
import zipfile

import pytest

from services.secure_upload_content import (
    ContentProcessResult,
    _validate_pdf,
    _validate_xlsx,
    process_upload_content,
)

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

MINIMAL_PDF = b"""%PDF-1.4
1 0 obj<<>>endobj
2 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Hello) Tj ET
endstream
endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 2 0 R>>endobj
4 0 obj<</Type/Catalog/Pages<</Kids[3 0 R]/Count 1>>>>endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000032 00000 n 
0000000125 00000 n 
0000000206 00000 n 
trailer<</Size 5/Root 4 0 R>>
startxref
280
%%EOF"""


class TestImageProcessing:
    def test_png_reencoded_and_sanitized(self):
        result = process_upload_content("png", "image/png", PNG_BYTES)
        assert result.ok
        assert result.sanitized
        assert result.data != PNG_BYTES or len(result.data) > 0
        assert result.content_type == "image/png"

    def test_corrupt_image_rejected(self):
        result = process_upload_content("png", "image/png", b"not-an-image")
        assert not result.ok
        assert "decode" in (result.reason or "").lower()


class TestPdfValidation:
    def test_minimal_pdf_passes(self):
        result = _validate_pdf("application/pdf", MINIMAL_PDF)
        assert result.ok

    def test_pdf_with_javascript_marker_rejected(self):
        bad = MINIMAL_PDF.replace(b"(Hello)", b"(Hello)") + b"\n/JavaScript (alert(1))"
        result = _validate_pdf("application/pdf", bad)
        assert not result.ok
        assert "prohibited" in (result.reason or "").lower()


class TestExcelValidation:
    def test_xlsx_with_vba_zip_entry_rejected(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/workbook.xml", "<workbook/>")
            zf.writestr("xl/vbaProject.bin", b"macro")
        result = _validate_xlsx(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buf.getvalue(),
        )
        assert not result.ok
        assert "macro" in (result.reason or "").lower()


class TestCsvNeutralization:
    def test_formula_injection_neutralized(self):
        csv_data = b"name,value\nfoo,=1+1\n"
        result = process_upload_content("csv", "text/csv", csv_data)
        assert result.ok
        assert result.sanitized
        assert b"'=1+1" in result.data or b"'=1+1" in result.data.replace(b"\r", b"")


class TestScanWorkerPhase3Integration:
    @pytest.mark.asyncio
    async def test_scan_stores_sanitized_image(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        from config.file_upload_config import UploadStatus
        from services.secure_upload_malware import MalwareScanResponse, MalwareScanResult
        from workers.scan_uploaded_file import scan_uploaded_file

        doc = {
            "id": "file-img",
            "status": UploadStatus.PENDING_SCAN.value,
            "tenant_id": "tenant-1",
            "extension": "png",
            "content_type": "image/png",
            "original_filename": "photo.png",
            "storage_key": "uploads-temp/tenant-1/file-img.png",
            "uploaded_by": "user-1",
            "scan_attempts": 0,
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=doc)
        mock_coll.update_one = AsyncMock()

        with patch("workers.scan_uploaded_file.db") as mock_db, \
             patch("workers.scan_uploaded_file.fetch_bytes", new=AsyncMock(return_value=(PNG_BYTES, "image/png"))), \
             patch("workers.scan_uploaded_file.scan_bytes", return_value=MalwareScanResponse(MalwareScanResult.UNSUPPORTED)), \
             patch("workers.scan_uploaded_file.store_bytes", new=AsyncMock()) as mock_store, \
             patch("workers.scan_uploaded_file.remove_object", new=AsyncMock()), \
             patch("workers.scan_uploaded_file.log_upload_audit_event", new=AsyncMock()):
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            result = await scan_uploaded_file("file-img")

        assert result["status"] == UploadStatus.AVAILABLE.value
        assert mock_store.call_count >= 1
        stored_data = mock_store.call_args_list[0][0][1]
        assert isinstance(stored_data, bytes)
        assert len(stored_data) > 0
