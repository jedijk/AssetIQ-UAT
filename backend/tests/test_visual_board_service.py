"""Unit tests for Visual Management Board service (mocked MongoDB)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from models.visual_board import BoardStatus, BoardType, CreateBoardRequest
from services import visual_board_service as svc
from services.visual_board_token import hash_token


class FakeDB:
    """Minimal async MongoDB stand-in for collection subscript access."""

    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            col = MagicMock()
            col.insert_one = AsyncMock()
            col.find_one = AsyncMock(return_value=None)
            col.update_one = AsyncMock()
            col.update_many = AsyncMock()
            col.delete_one = AsyncMock()
            col.delete_many = AsyncMock()
            col.count_documents = AsyncMock(return_value=0)
            find_cursor = MagicMock()
            find_cursor.sort = MagicMock(return_value=find_cursor)
            find_cursor.skip = MagicMock(return_value=find_cursor)
            find_cursor.limit = MagicMock(return_value=find_cursor)
            find_cursor.to_list = AsyncMock(return_value=[])
            col.find = MagicMock(return_value=find_cursor)
            self._collections[name] = col
        return self._collections[name]


@pytest.fixture
def mock_user():
    return {"id": "user-1", "company_id": "co-1", "role": "reliability_engineer"}


@pytest.fixture
def mock_db():
    return FakeDB()


@pytest.mark.asyncio
async def test_create_board_seeds_reliability_widgets(mock_user, mock_db):
    request = CreateBoardRequest(name="Test Board", board_type=BoardType.RELIABILITY)

    with patch("services.visual_board_service.db", mock_db):
        result = await svc.create_board(request, mock_user)

    assert result.name == "Test Board"
    assert result.status == BoardStatus.DRAFT
    assert len(result.widgets) == 6
    widget_ids = {w.id for w in result.widgets}
    assert "w_active_exposure" in widget_ids
    assert "w_status" in widget_ids
    boards = mock_db._collections["visual_boards"]
    boards.insert_one.assert_awaited_once()
    inserted = boards.insert_one.await_args[0][0]
    assert inserted["tenant_id"] == "co-1"
    assert inserted["board_type"] == "reliability"


@pytest.mark.asyncio
async def test_get_board_not_found(mock_user, mock_db):
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value=None)
    with patch("services.visual_board_service.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await svc.get_board("missing", mock_user)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_publish_board_creates_version_and_token(mock_user, mock_db):
    board_doc = {
        "id": "board-1",
        "name": "Reliability Board",
        "version": 0,
        "layout": {"columns": 12, "rows": 6},
        "widgets": [],
        "plant": None,
        "area": None,
        "tenant_id": "co-1",
    }
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value=board_doc)
    versions = mock_db["visual_board_versions"]
    tokens = mock_db["visual_board_tokens"]

    with patch("services.visual_board_service.db", mock_db):
        result = await svc.publish_board("board-1", mock_user)

    assert result.board_id == "board-1"
    assert result.version == 1
    assert result.token.startswith("vmb_")
    assert result.url == f"/vmb/{result.token}"
    versions.insert_one.assert_awaited_once()
    token_insert = tokens.insert_one.await_args[0][0]
    assert token_insert["token_hash"] == hash_token(result.token)
    assert token_insert["is_active"] is True


@pytest.mark.asyncio
async def test_resolve_token_invalid(mock_db):
    tokens = mock_db["visual_board_tokens"]
    tokens.find_one = AsyncMock(return_value=None)
    with patch("services.visual_board_service.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await svc.resolve_token("vmb_" + "a" * 64)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_unpublish_deactivates_tokens(mock_user, mock_db):
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value={"id": "board-1"})
    tokens = mock_db["visual_board_tokens"]

    with patch("services.visual_board_service.db", mock_db):
        result = await svc.unpublish_board("board-1", mock_user)

    assert result["status"] == BoardStatus.ARCHIVED.value
    tokens.update_many.assert_awaited_once()
