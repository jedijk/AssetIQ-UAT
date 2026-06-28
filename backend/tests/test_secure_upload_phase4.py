"""Phase 4 — preview generation, admin quarantine, re-scan, security dashboard."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from config.file_upload_config import UploadStatus
from services.secure_upload_preview import PreviewResult, generate_preview
from services.secure_upload_malware import MalwareScanResponse, MalwareScanResult
from services.secure_upload_content import ContentProcessResult

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestPreviewGeneration:
    def test_png_preview_generated(self):
        result = generate_preview("png", "image/png", PNG_BYTES)
        assert result.ok
        assert result.data
        assert result.content_type == "image/png"
        assert len(result.data) > 0

    def test_csv_has_no_preview(self):
        result = generate_preview("csv", "text/csv", b"a,b\n1,2\n")
        assert not result.ok


class TestPreviewUrl:
    @pytest.mark.asyncio
    async def test_preview_url_blocked_when_not_available(self):
        from services import secure_upload_service as svc
        from fastapi import HTTPException

        user = {"id": "user-1", "role": "owner", "company_id": "tenant-1"}
        mock_doc = {
            "id": "file-1",
            "status": UploadStatus.AVAILABLE.value,
            "preview_available": False,
            "uploaded_by": "user-1",
            "linked_entity_type": "document_library",
            "tenant_id": "tenant-1",
        }
        coll = MagicMock()
        coll.find_one = AsyncMock(return_value=mock_doc)

        with patch.object(svc, "_collection", return_value=coll), \
             patch("services.secure_upload_access.assert_file_access", new=AsyncMock()):
            with pytest.raises(HTTPException) as exc:
                await svc.get_preview_url(user, "file-1")

        assert exc.value.status_code == 404
        assert "preview" in exc.value.detail.lower()


class TestAdminQuarantine:
    @pytest.mark.asyncio
    async def test_quarantine_list_requires_admin_role(self):
        from services import secure_upload_service as svc
        from fastapi import HTTPException

        user = {"id": "user-1", "role": "viewer", "company_id": "tenant-1"}

        with pytest.raises(HTTPException) as exc:
            await svc.list_quarantined_files(user)

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_quarantine_list_returns_admin_view(self):
        from services import secure_upload_service as svc

        admin = {"id": "admin-1", "role": "admin", "company_id": "tenant-1"}
        doc = {
            "id": "file-q1",
            "status": UploadStatus.QUARANTINED.value,
            "original_filename": "bad.pdf",
            "rejection_reason": "Malware detected",
            "malware_scan_result": "infected",
            "updated_at": "2026-06-28T00:00:00+00:00",
        }
        coll = MagicMock()
        coll.count_documents = AsyncMock(return_value=1)

        async def _iter_cursor(*_args, **_kwargs):
            yield doc

        mock_cursor = MagicMock()
        mock_cursor.sort = MagicMock(return_value=mock_cursor)
        mock_cursor.skip = MagicMock(return_value=mock_cursor)
        mock_cursor.limit = MagicMock(return_value=mock_cursor)
        mock_cursor.__aiter__ = lambda self: _iter_cursor()

        coll.find = MagicMock(return_value=mock_cursor)

        with patch.object(svc, "_collection", return_value=coll), \
             patch("services.secure_upload_service.merge_tenant_filter", side_effect=lambda q, _u: q):
            result = await svc.list_quarantined_files(admin)

        assert result["total"] == 1
        assert result["items"][0]["rejection_reason"] == "Malware detected"
        assert result["items"][0]["malware_scan_result"] == "infected"


class TestRescan:
    @pytest.mark.asyncio
    async def test_rescan_sets_pending_scan(self):
        from services import secure_upload_service as svc

        admin = {"id": "admin-1", "role": "owner", "company_id": "tenant-1"}
        mock_doc = {
            "id": "file-1",
            "status": UploadStatus.AVAILABLE.value,
            "safe_storage_key": "uploads-safe/tenant-1/file-1.png",
            "storage_key": "uploads-safe/tenant-1/file-1.png",
            "tenant_id": "tenant-1",
            "linked_entity_type": "document_library",
        }
        coll = MagicMock()
        coll.find_one = AsyncMock(return_value=mock_doc)
        coll.update_one = AsyncMock()
        bg = MagicMock()

        with patch.object(svc, "_collection", return_value=coll), \
             patch.object(svc, "log_upload_audit_event", new=AsyncMock()), \
             patch("services.background_jobs.schedule_tracked_job") as mock_schedule:
            result = await svc.request_rescan(admin, "file-1", bg)

        assert result["status"] == UploadStatus.PENDING_SCAN.value
        update = coll.update_one.call_args[0][1]["$set"]
        assert update["status"] == UploadStatus.PENDING_SCAN.value
        assert update["preview_available"] is False
        mock_schedule.assert_called_once()


class TestDashboardStats:
    @pytest.mark.asyncio
    async def test_dashboard_stats_aggregation(self):
        from services import secure_upload_service as svc

        admin = {"id": "admin-1", "role": "admin", "company_id": "tenant-1"}

        async def _agg_rows(*_args, **_kwargs):
            for row in (
                {"_id": UploadStatus.AVAILABLE.value, "count": 10},
                {"_id": UploadStatus.QUARANTINED.value, "count": 2},
                {"_id": UploadStatus.REJECTED.value, "count": 1},
            ):
                yield row

        coll = MagicMock()
        mock_agg = MagicMock()
        mock_agg.__aiter__ = lambda self: _agg_rows()
        coll.aggregate = MagicMock(return_value=mock_agg)

        audit_coll = MagicMock()
        mock_audit_cursor = MagicMock()
        mock_audit_cursor.sort = MagicMock(return_value=mock_audit_cursor)
        mock_audit_cursor.limit = MagicMock(return_value=mock_audit_cursor)
        mock_audit_cursor.__aiter__ = lambda self: _iter_empty()
        audit_coll.find = MagicMock(return_value=mock_audit_cursor)

        async def _iter_empty():
            return
            yield  # pragma: no cover

        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=audit_coll)

        with patch.object(svc, "_collection", return_value=coll), \
             patch.object(svc, "db", mock_db), \
             patch("services.secure_upload_service.merge_tenant_filter", side_effect=lambda q, _u: q):
            stats = await svc.get_security_dashboard_stats(admin)

        assert stats["summary"]["available"] == 10
        assert stats["summary"]["quarantined"] == 2
        assert stats["summary"]["rejected"] == 1
        assert stats["summary"]["total"] == 13
        assert stats["summary"]["rejection_rate"] == round(1 / 13, 4)
        assert stats["summary"]["quarantine_rate"] == round(2 / 13, 4)


class TestScanWorkerPreview:
    @pytest.mark.asyncio
    async def test_scan_stores_preview_for_png(self):
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

        preview_bytes = b"preview-png-data"

        with patch("workers.scan_uploaded_file.db") as mock_db, \
             patch("workers.scan_uploaded_file.fetch_bytes", new=AsyncMock(return_value=(PNG_BYTES, "image/png"))), \
             patch("workers.scan_uploaded_file.scan_bytes", return_value=MalwareScanResponse(MalwareScanResult.UNSUPPORTED)), \
             patch("workers.scan_uploaded_file.process_upload_content") as mock_content, \
             patch("workers.scan_uploaded_file.generate_preview") as mock_preview, \
             patch("workers.scan_uploaded_file.store_bytes", new=AsyncMock()) as mock_store, \
             patch("workers.scan_uploaded_file.remove_object", new=AsyncMock()), \
             patch("workers.scan_uploaded_file.log_upload_audit_event", new=AsyncMock()):
            mock_content.return_value = ContentProcessResult(
                ok=True, data=PNG_BYTES, content_type="image/png", sanitized=False,
            )
            mock_preview.return_value = PreviewResult(
                ok=True, data=preview_bytes, content_type="image/png",
            )
            mock_db.__getitem__ = MagicMock(return_value=mock_coll)

            result = await scan_uploaded_file("file-1")

        assert result["status"] == UploadStatus.AVAILABLE.value
        assert mock_store.call_count >= 2
        final_update = mock_coll.update_one.call_args_list[-1][0][1]["$set"]
        assert final_update.get("preview_available") is True
        assert final_update.get("preview_storage_key")
