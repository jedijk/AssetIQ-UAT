"""Unit tests for visual display device pairing (Phase 4a)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from services import visual_display_pairing_service as pairing_svc
from services.visual_display_token import PAIR_CODE_CHARS, generate_pair_code


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
def mock_user():
    return {"id": "user-1", "company_id": "co-1", "role": "admin"}


@pytest.fixture
def mock_db():
    return FakeDB()


def test_generate_pair_code_format():
    code = generate_pair_code()
    assert len(code) == 6
    assert code == code.upper()
    for ch in code:
        assert ch in PAIR_CODE_CHARS
        assert ch not in "0O1I"


@pytest.mark.asyncio
async def test_request_pairing_creates_code(mock_db):
    pairings = mock_db["visual_display_pairings"]
    pairings.find_one = AsyncMock(return_value=None)
    events = mock_db["visual_display_events"]

    with patch("services.visual_display_pairing_service.db", mock_db):
        result = await pairing_svc.request_pairing(
            device_fingerprint="fp_test_12345678",
            user_agent="TestAgent",
            screen_width=1920,
            screen_height=1080,
        )

    assert len(result.pair_code) == 6
    assert result.expires_in == 600
    pairings.insert_one.assert_awaited_once()
    events.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_complete_pairing_assigns_board(mock_user, mock_db):
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(minutes=5)).isoformat()
    pairing_doc = {
        "id": "pair_1",
        "pair_code": "ABCDEF",
        "device_fingerprint": "fp_test_12345678",
        "status": "pending",
        "expires_at": expires,
        "user_agent": "Chrome",
        "screen_width": 1920,
        "screen_height": 1080,
    }
    pairings = mock_db["visual_display_pairings"]
    pairings.find_one = AsyncMock(return_value=pairing_doc)
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value={"id": "board_1", "name": "Ops Board"})
    devices = mock_db["visual_display_devices"]
    events = mock_db["visual_display_events"]

    with patch("services.visual_display_pairing_service.db", mock_db):
        result = await pairing_svc.complete_pairing(
            pair_code="ABCDEF",
            board_id="board_1",
            screen_name="Control Room TV",
            location="Plant A",
            area="Extrusion",
            user=mock_user,
        )

    assert result.device_id.startswith("device_")
    assert result.device_token.startswith("dvc_")
    assert result.board_id == "board_1"
    devices.insert_one.assert_awaited_once()
    pairings.update_one.assert_awaited()
    events.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_poll_pairing_delivers_token_once(mock_db):
    pairing_doc = {
        "id": "pair_1",
        "pair_code": "ABCDEF",
        "device_fingerprint": "fp_test_12345678",
        "status": "completed",
        "device_id": "device_1",
        "token_delivered": False,
        "pending_delivery_token": "dvc_testtoken123456789012345678901234567890123456789012345678901234",
        "screen_name": "TV",
    }
    device_doc = {
        "id": "device_1",
        "board_id": "board_1",
        "screen_name": "TV",
        "tenant_id": "co-1",
    }
    pairings = mock_db["visual_display_pairings"]
    pairings.find_one = AsyncMock(return_value=pairing_doc)
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=device_doc)

    with patch("services.visual_display_pairing_service.db", mock_db):
        status = await pairing_svc.poll_pairing_status("ABCDEF", device_fingerprint="fp_test_12345678")

    assert status.status == "paired"
    assert status.device_token.startswith("dvc_")
    pairings.update_one.assert_awaited()


@pytest.mark.asyncio
async def test_preview_expired_pairing(mock_db):
    expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    pairings = mock_db["visual_display_pairings"]
    pairings.find_one = AsyncMock(
        return_value={
            "id": "pair_1",
            "pair_code": "ABCDEF",
            "status": "pending",
            "expires_at": expired,
        }
    )

    with patch("services.visual_display_pairing_service.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await pairing_svc.get_pairing_preview("ABCDEF")
    assert exc.value.status_code == 400
