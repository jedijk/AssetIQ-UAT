"""Environment-driven secure upload configuration toggles."""
from __future__ import annotations

import importlib

import pytest

_ENV_KEYS = (
    "SECURE_UPLOAD_ENABLED",
    "SECURE_UPLOAD_FAST_PATH",
    "FILE_UPLOAD_ENABLE_MALWARE_SCAN",
    "FILE_UPLOAD_ENABLE_IMAGE_REENCODING",
    "FILE_UPLOAD_ENABLE_PDF_VALIDATION",
    "FILE_UPLOAD_ENABLE_PDF_SANITIZATION",
    "FILE_UPLOAD_ENABLE_EXCEL_MACRO_DETECTION",
    "FILE_UPLOAD_ENABLE_CSV_VALIDATION",
    "FILE_UPLOAD_ENABLE_PREVIEW_GENERATION",
    "CLAMAV_HOST",
)


@pytest.fixture(autouse=True)
def _reset_file_upload_config(monkeypatch):
    """Reload config after each test so env overrides do not leak."""
    yield
    for key in _ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    from config import file_upload_config as cfg
    importlib.reload(cfg)


def _reload_modules(monkeypatch, **env: str | None):
    for key in _ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    from config import file_upload_config as cfg
    importlib.reload(cfg)
    from services import secure_upload_service as svc
    importlib.reload(svc)
    from services import secure_upload_malware as mal
    importlib.reload(mal)
    return cfg, svc, mal


class TestFileUploadConfigEnv:
    def test_defaults_are_secure(self, monkeypatch):
        cfg, _, _ = _reload_modules(monkeypatch)
        assert cfg.is_secure_upload_enabled() is True
        assert cfg.is_secure_upload_fast_path() is False
        assert cfg.FILE_UPLOAD_CONFIG["enable_image_reencoding"] is True
        assert cfg.FILE_UPLOAD_CONFIG["enable_malware_scan"] is True

    def test_master_disable_via_env(self, monkeypatch):
        cfg, _, _ = _reload_modules(monkeypatch, SECURE_UPLOAD_ENABLED="false")
        assert cfg.is_secure_upload_enabled() is False

    def test_fast_path_via_env(self, monkeypatch):
        cfg, _, _ = _reload_modules(monkeypatch, SECURE_UPLOAD_FAST_PATH="true")
        assert cfg.is_secure_upload_fast_path() is True

    def test_feature_toggle_via_env(self, monkeypatch):
        cfg, _, _ = _reload_modules(monkeypatch, FILE_UPLOAD_ENABLE_IMAGE_REENCODING="0")
        assert cfg.FILE_UPLOAD_CONFIG["enable_image_reencoding"] is False


class TestSecureUploadEnvGates:
    @pytest.mark.asyncio
    async def test_api_returns_503_when_disabled(self, monkeypatch):
        _, svc, _ = _reload_modules(monkeypatch, SECURE_UPLOAD_ENABLED="false")
        with pytest.raises(Exception) as exc:
            svc.assert_secure_upload_enabled()
        assert exc.value.status_code == 503

    @pytest.mark.asyncio
    async def test_complete_upload_fast_path_marks_available(self, monkeypatch):
        _, svc, _ = _reload_modules(monkeypatch, SECURE_UPLOAD_FAST_PATH="true")

        from unittest.mock import AsyncMock, MagicMock, patch
        from config.file_upload_config import UploadStatus

        PNG_BYTES = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
            b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
            b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )

        doc = {
            "id": "file-fast",
            "status": UploadStatus.UPLOADED.value,
            "tenant_id": "tenant-1",
            "extension": "png",
            "content_type": "image/png",
            "original_filename": "photo.png",
            "storage_key": "uploads-temp/tenant-1/file-fast.png",
            "uploaded_by": "user-1",
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=doc)
        mock_coll.update_one = AsyncMock()

        user = {"id": "user-1", "role": "admin", "tenant_id": "tenant-1"}
        bg = MagicMock()

        with patch.object(svc, "_collection", return_value=mock_coll), \
             patch.object(svc, "assert_file_access", new=AsyncMock()), \
             patch.object(svc, "fetch_bytes", new=AsyncMock(return_value=(PNG_BYTES, "image/png"))), \
             patch.object(svc, "store_bytes", new=AsyncMock()), \
             patch.object(svc, "remove_object", new=AsyncMock()), \
             patch.object(svc, "log_upload_audit_event", new=AsyncMock()):
            result = await svc.complete_upload(user, "file-fast", bg)

        assert result["status"] == UploadStatus.AVAILABLE.value

    def test_malware_scan_respects_disable_flag(self, monkeypatch):
        _, _, mal = _reload_modules(monkeypatch, FILE_UPLOAD_ENABLE_MALWARE_SCAN="false")

        from services.secure_upload_malware import MalwareScanResult

        resp = mal.scan_bytes(b"test")
        assert resp.result == MalwareScanResult.UNSUPPORTED
        assert "disabled" in (resp.detail or "").lower()
