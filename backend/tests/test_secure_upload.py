"""Unit tests for secure file upload pipeline."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from config.file_upload_config import UploadStatus
from services.secure_upload_malware import MalwareScanResponse, MalwareScanResult
from services.secure_upload_content import ContentProcessResult
from services.secure_upload_validation import (
    validate_extension,
    validate_file_content,
    validate_upload_metadata,
    detect_magic_bytes,
)


# Minimal valid PNG (1x1)
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

PDF_BYTES = b"%PDF-1.4 minimal test content"


class TestValidation:
    def test_rejects_dangerous_extension(self):
        result = validate_extension("malware.exe")
        assert not result.ok
        assert "not allowed" in (result.reason or "").lower()

    def test_accepts_allowed_extension(self):
        result = validate_extension("report.pdf")
        assert result.ok
        assert result.detected_extension == "pdf"

    def test_rejects_unsupported_extension(self):
        result = validate_extension("archive.rar")
        assert not result.ok

    def test_validate_upload_metadata_size_limit(self):
        result = validate_upload_metadata("photo.jpg", "image/jpeg", 50 * 1024 * 1024)
        assert not result.ok
        assert "maximum size" in (result.reason or "").lower()

    def test_detect_magic_bytes_png(self):
        assert detect_magic_bytes(PNG_BYTES) == "png"

    def test_detect_magic_bytes_pdf(self):
        assert detect_magic_bytes(PDF_BYTES) == "pdf"

    def test_extension_spoof_detected(self):
        result = validate_file_content("image.png", "image/png", PDF_BYTES)
        assert not result.ok
        assert "does not match" in (result.reason or "").lower()

    def test_valid_png_passes_content_validation(self):
        result = validate_file_content("photo.png", "image/png", PNG_BYTES)
        assert result.ok


class TestStatusTransitions:
    @pytest.mark.asyncio
    async def test_complete_upload_schedules_scan(self):
        from services import secure_upload_service as svc

        user = {"id": "user-1", "role": "owner", "company_id": "tenant-1"}
        mock_doc = {
            "id": "file-1",
            "status": UploadStatus.UPLOADED.value,
            "storage_key": "uploads-temp/tenant-1/file-1.png",
            "uploaded_by": "user-1",
            "linked_entity_type": "document_library",
            "tenant_id": "tenant-1",
        }
        coll = MagicMock()
        coll.find_one = AsyncMock(return_value=mock_doc)
        coll.update_one = AsyncMock()

        bg = MagicMock()

        with patch.object(svc, "_collection", return_value=coll), \
             patch.object(svc, "log_upload_audit_event", new=AsyncMock()), \
             patch("services.secure_upload_access.assert_file_access", new=AsyncMock()), \
             patch("services.background_jobs.schedule_tracked_job") as mock_schedule:
            result = await svc.complete_upload(user, "file-1", bg)

        assert result["status"] == UploadStatus.PENDING_SCAN.value
        mock_schedule.assert_called_once()
        assert mock_schedule.call_args[0][1] == "scan_uploaded_file"

    @pytest.mark.asyncio
    async def test_download_denied_when_not_available(self):
        from services import secure_upload_service as svc
        from fastapi import HTTPException

        user = {"id": "user-1", "role": "owner", "company_id": "tenant-1"}
        mock_doc = {
            "id": "file-1",
            "status": UploadStatus.SCANNING.value,
            "uploaded_by": "user-1",
            "linked_entity_type": "document_library",
            "tenant_id": "tenant-1",
        }
        coll = MagicMock()
        coll.find_one = AsyncMock(return_value=mock_doc)

        with patch.object(svc, "_collection", return_value=coll), \
             patch("services.secure_upload_access.assert_file_access", new=AsyncMock()):
            with pytest.raises(HTTPException) as exc:
                await svc.get_download_url(user, "file-1")

        assert exc.value.status_code == 403
        assert "not available" in exc.value.detail.lower()


class TestScanWorker:
    @pytest.mark.asyncio
    async def test_scan_moves_valid_file_to_available(self):
        from workers.scan_uploaded_file import scan_uploaded_file

        doc = {
            "id": "file-1",
            "status": UploadStatus.PENDING_SCAN.value,
            "tenant_id": "tenant-1",
            "extension": "png",
            "content_type": "image/png",
            "original_filename": "photo.png",
            "storage_key": "uploads-temp/tenant-1/file-1.png",
            "uploaded_by": "user-1",
            "scan_attempts": 0,
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=doc)
        mock_coll.update_one = AsyncMock()

        with patch("workers.scan_uploaded_file.db") as mock_db, \
             patch("workers.scan_uploaded_file.fetch_bytes", new=AsyncMock(return_value=(PNG_BYTES, "image/png"))), \
             patch("workers.scan_uploaded_file.scan_bytes") as mock_scan, \
             patch("workers.scan_uploaded_file.process_upload_content") as mock_content, \
             patch("workers.scan_uploaded_file.store_bytes", new=AsyncMock()) as mock_store, \
             patch("workers.scan_uploaded_file.remove_object", new=AsyncMock()), \
             patch("workers.scan_uploaded_file.log_upload_audit_event", new=AsyncMock()):
            mock_scan.return_value = MalwareScanResponse(MalwareScanResult.UNSUPPORTED)
            mock_content.return_value = ContentProcessResult(
                ok=True, data=PNG_BYTES, content_type="image/png", sanitized=False,
            )
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            result = await scan_uploaded_file("file-1")

        assert result["status"] == UploadStatus.AVAILABLE.value
        mock_store.assert_called_once()

    @pytest.mark.asyncio
    async def test_scan_rejects_spoofed_extension(self):
        from workers.scan_uploaded_file import scan_uploaded_file

        doc = {
            "id": "file-2",
            "status": UploadStatus.PENDING_SCAN.value,
            "tenant_id": "tenant-1",
            "scan_attempts": 0,
            "extension": "png",
            "content_type": "image/png",
            "original_filename": "fake.png",
            "storage_key": "uploads-temp/tenant-1/file-2.png",
            "uploaded_by": "user-1",
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=doc)
        mock_coll.update_one = AsyncMock()

        with patch("workers.scan_uploaded_file.db") as mock_db, \
             patch("workers.scan_uploaded_file.fetch_bytes", new=AsyncMock(return_value=(PDF_BYTES, "application/pdf"))), \
             patch("workers.scan_uploaded_file.scan_bytes", return_value=MalwareScanResponse(MalwareScanResult.UNSUPPORTED)), \
             patch("workers.scan_uploaded_file.process_upload_content") as mock_content, \
             patch("workers.scan_uploaded_file.move_object", new=AsyncMock()), \
             patch("workers.scan_uploaded_file.log_upload_audit_event", new=AsyncMock()):
            mock_content.return_value = ContentProcessResult(
                ok=False,
                data=PDF_BYTES,
                content_type="application/pdf",
                reason="File content does not match",
            )
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            result = await scan_uploaded_file("file-2")

        assert result["status"] in {UploadStatus.REJECTED.value, UploadStatus.QUARANTINED.value}
        update = mock_coll.update_one.call_args[0][1]["$set"]
        assert update.get("rejection_reason")
