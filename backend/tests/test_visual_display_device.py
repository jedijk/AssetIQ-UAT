"""Unit tests for visual display device runtime (Phase 4b)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from services import visual_display_device_service as device_svc
from services.visual_display_token import generate_device_token

MOCK_DBS = {"production": {"name": "assetiq"}, "uat": {"name": "assetiq-UAT"}}


@contextmanager
def patch_device_db(mock_db, *, db_map=None):
    db_map = db_map or {"assetiq": mock_db, "assetiq-UAT": mock_db}

    def get_db(name):
        return db_map.get(name, mock_db)

    with patch("services.visual_display_device_service.get_current_db_name", return_value="assetiq"), patch(
        "services.visual_display_device_service.AVAILABLE_DATABASES", MOCK_DBS
    ), patch("services.visual_display_device_service.get_database", side_effect=get_db), patch(
        "services.visual_display_device_service.set_request_db"
    ), patch("services.visual_display_device_service.db", mock_db):
        yield


class FakeDB:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            col = MagicMock()
            col.insert_one = AsyncMock()
            col.update_one = AsyncMock()
            col.find_one = AsyncMock(return_value=None)
            find_cursor = MagicMock()
            find_cursor.sort = MagicMock(return_value=find_cursor)
            find_cursor.to_list = AsyncMock(return_value=[])
            col.find = MagicMock(return_value=find_cursor)
            self._collections[name] = col
        return self._collections[name]


@pytest.fixture
def mock_db():
    return FakeDB()


def test_extract_device_token_from_authorization_header():
    class Req:
        headers = {"authorization": "DeviceToken dvc_abc123"}
        query_params = {}

    assert device_svc.extract_device_token(Req()) == "dvc_abc123"


def test_extract_device_token_from_query_when_allowed():
    class Req:
        headers = {}
        query_params = {"device_token": "dvc_query123"}

    assert device_svc.extract_device_token(Req(), allow_query=True) == "dvc_query123"
    assert device_svc.extract_device_token(Req()) is None


@pytest.mark.asyncio
async def test_resolve_device_token_invalid(mock_db):
    with patch_device_db(mock_db):
        with pytest.raises(HTTPException) as exc:
            await device_svc.resolve_device_token("not-a-token")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_connect_device_returns_board(mock_db):
    raw_token, token_hash = generate_device_token()
    device_doc = {
        "id": "device_1",
        "screen_name": "Line TV",
        "board_id": "board_1",
        "tenant_id": "co-1",
        "status": "active",
        "token_hash": token_hash,
    }
    board_doc = {
        "id": "board_1",
        "name": "Ops Board",
        "status": "published",
        "version": 2,
        "refresh_interval_seconds": 45,
        "widgets": [],
        "layout": {},
    }
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=device_doc)
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value=board_doc)
    versions = mock_db["visual_board_versions"]
    versions.find_one = AsyncMock(return_value=None)
    events = mock_db["visual_display_events"]

    with patch_device_db(mock_db):
        result = await device_svc.connect_device(raw_token)

    assert result["device_id"] == "device_1"
    assert result["board_id"] == "board_1"
    assert result["board_version"] == 2
    devices.update_one.assert_awaited()
    events.insert_one.assert_awaited()


@pytest.mark.asyncio
async def test_record_device_heartbeat_updates_last_seen(mock_db):
    raw_token, token_hash = generate_device_token()
    device_doc = {
        "id": "device_1",
        "screen_name": "Line TV",
        "board_id": "board_1",
        "tenant_id": "co-1",
        "status": "active",
        "token_hash": token_hash,
    }
    board_doc = {
        "id": "board_1",
        "name": "Ops Board",
        "status": "published",
        "version": 1,
        "widgets": [],
        "layout": {},
    }
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=device_doc)
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value=board_doc)
    versions = mock_db["visual_board_versions"]
    versions.find_one = AsyncMock(return_value=None)

    with patch_device_db(mock_db):
        result = await device_svc.record_device_heartbeat(device_id="device_1", raw_token=raw_token)

    assert result["device_id"] == "device_1"
    assert result["status"] == "online"
    devices.update_one.assert_awaited()


@pytest.mark.asyncio
async def test_resolve_rejects_disabled_device(mock_db):
    raw_token, token_hash = generate_device_token()
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(
        return_value={
            "id": "device_1",
            "status": "disabled",
            "token_hash": token_hash,
            "board_id": "board_1",
        }
    )

    with patch_device_db(mock_db):
        with pytest.raises(HTTPException) as exc:
            await device_svc.resolve_device_token(raw_token)
    assert exc.value.status_code == 403
