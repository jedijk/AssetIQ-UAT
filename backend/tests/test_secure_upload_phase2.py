"""Phase 2 tests: malware scan, cleanup, pending_scan flow."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from config.file_upload_config import UploadStatus
from services.secure_upload_malware import MalwareScanResponse, MalwareScanResult, scan_bytes

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestMalwareScanner:
    def test_unsupported_when_clamav_not_configured(self, monkeypatch):
        monkeypatch.delenv("CLAMAV_HOST", raising=False)
        result = scan_bytes(b"test")
        assert result.result == MalwareScanResult.UNSUPPORTED

    def test_clean_response_parsing(self):
        from services.secure_upload_malware import _parse_clamav_response

        assert _parse_clamav_response("stream: OK").result == MalwareScanResult.CLEAN

    def test_infected_response_parsing(self):
        from services.secure_upload_malware import _parse_clamav_response

        parsed = _parse_clamav_response("stream: Eicar-Test-Signature FOUND")
        assert parsed.result == MalwareScanResult.INFECTED
        assert "Eicar" in (parsed.signature or "")


class TestScanWorkerPhase2:
    @pytest.mark.asyncio
    async def test_infected_file_quarantined(self):
        from workers.scan_uploaded_file import scan_uploaded_file

        doc = {
            "id": "file-x",
            "status": UploadStatus.PENDING_SCAN.value,
            "tenant_id": "tenant-1",
            "extension": "png",
            "content_type": "image/png",
            "original_filename": "photo.png",
            "storage_key": "uploads-temp/tenant-1/file-x.png",
            "uploaded_by": "user-1",
            "scan_attempts": 0,
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=doc)
        mock_coll.update_one = AsyncMock()

        infected = MalwareScanResponse(MalwareScanResult.INFECTED, signature="Eicar")

        with patch("workers.scan_uploaded_file.db") as mock_db, \
             patch("workers.scan_uploaded_file.fetch_bytes", new=AsyncMock(return_value=(PNG_BYTES, "image/png"))), \
             patch("workers.scan_uploaded_file.scan_bytes", return_value=infected), \
             patch("workers.scan_uploaded_file.move_object", new=AsyncMock()), \
             patch("workers.scan_uploaded_file.log_upload_audit_event", new=AsyncMock()):
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            result = await scan_uploaded_file("file-x")

        assert result["status"] == UploadStatus.QUARANTINED.value

    @pytest.mark.asyncio
    async def test_scan_retry_on_timeout(self):
        from workers.scan_uploaded_file import scan_uploaded_file

        doc = {
            "id": "file-y",
            "status": UploadStatus.PENDING_SCAN.value,
            "tenant_id": "tenant-1",
            "extension": "png",
            "content_type": "image/png",
            "original_filename": "photo.png",
            "storage_key": "uploads-temp/tenant-1/file-y.png",
            "uploaded_by": "user-1",
            "scan_attempts": 0,
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=doc)
        mock_coll.update_one = AsyncMock()

        timeout = MalwareScanResponse(MalwareScanResult.TIMEOUT, detail="timed out")

        with patch("workers.scan_uploaded_file.db") as mock_db, \
             patch("workers.scan_uploaded_file.fetch_bytes", new=AsyncMock(return_value=(PNG_BYTES, "image/png"))), \
             patch("workers.scan_uploaded_file.scan_bytes", return_value=timeout), \
             patch("workers.scan_uploaded_file.log_upload_audit_event", new=AsyncMock()):
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            result = await scan_uploaded_file("file-y")

        assert result["status"] == UploadStatus.PENDING_SCAN.value
        assert result.get("retry") is True


class TestUploadCleanup:
    @pytest.mark.asyncio
    async def test_cleanup_dry_run(self):
        from workers.upload_cleanup import run_upload_cleanup

        mock_cursor = MagicMock()
        mock_cursor.__aiter__ = lambda self: self
        mock_cursor._items = iter([])

        async def _anext(_self):
            try:
                return next(_self._items)
            except StopIteration:
                raise StopAsyncIteration

        mock_cursor.__anext__ = _anext

        with patch("workers.upload_cleanup.db") as mock_db:
            mock_coll = MagicMock()
            mock_coll.find = MagicMock(return_value=mock_cursor)
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            stats = await run_upload_cleanup(dry_run=True)

        assert stats["dry_run"] is True
        assert "abandoned_temp_deleted" in stats
