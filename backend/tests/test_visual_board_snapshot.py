"""Unit tests for visual board TV snapshot storage."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from services import visual_board_snapshot_service as snapshot_svc

MOCK_USER = {"company_id": "co-1", "tenant_id": "co-1"}


class FakeDB:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            col = MagicMock()
            col.find_one = AsyncMock(return_value=None)
            col.update_one = AsyncMock()
            self._collections[name] = col
        return self._collections[name]


@pytest.fixture
def mock_db():
    return FakeDB()


@pytest.mark.asyncio
async def test_store_board_snapshot_persists_metadata(mock_db):
    board = {
        "id": "board_1",
        "version": 3,
        "name": "Ops",
    }
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value=board)
    versions = mock_db["visual_board_versions"]

    png = b"\x89PNG\r\n\x1a\n" + b"x" * 100

    with patch("services.visual_board_snapshot_service.db", mock_db), patch(
        "services.visual_board_snapshot_service.put_object_async", new_callable=AsyncMock
    ) as put_mock, patch(
        "services.visual_board_snapshot_service.merge_tenant_filter", side_effect=lambda q, _u: q
    ):
        result = await snapshot_svc.store_board_snapshot("board_1", MOCK_USER, png, "image/png")

    put_mock.assert_awaited_once()
    boards.update_one.assert_awaited()
    versions.update_one.assert_awaited()
    assert result["board_id"] == "board_1"
    assert result["version"] == 3
    assert "display-snapshot.png" in result["display_snapshot_path"]


@pytest.mark.asyncio
async def test_store_board_snapshot_rejects_empty(mock_db):
    with patch("services.visual_board_snapshot_service.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await snapshot_svc.store_board_snapshot("board_1", MOCK_USER, b"", "image/png")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_get_device_snapshot_missing_meta(mock_db):
    device = {"id": "dev_1", "board_id": "board_1", "tenant_id": "co-1"}
    board = {"id": "board_1", "version": 1}
    version = {}

    with patch(
        "services.visual_display_device_service._find_board_for_device",
        new_callable=AsyncMock,
        return_value=(board, version, "assetiq"),
    ):
        with pytest.raises(HTTPException) as exc:
            await snapshot_svc.get_device_snapshot_from_device_doc(device)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_device_snapshot_returns_bytes():
    device = {"id": "dev_1", "board_id": "board_1", "tenant_id": "co-1"}
    board = {
        "id": "board_1",
        "version": 1,
        "display_snapshot_path": "visual-boards/board_1/v1/display-snapshot.jpg",
        "display_snapshot_content_type": "image/jpeg",
    }
    version = {}
    image = b"\xff\xd8\xff" + b"x" * 50

    with patch(
        "services.visual_display_device_service._find_board_for_device",
        new_callable=AsyncMock,
        return_value=(board, version, "assetiq"),
    ), patch(
        "services.visual_board_snapshot_service.get_object_async",
        new_callable=AsyncMock,
        return_value=(image, "image/jpeg"),
    ):
        data, content_type, updated_at = await snapshot_svc.get_device_snapshot_from_device_doc(device)

    assert data == image
    assert content_type == "image/jpeg"
