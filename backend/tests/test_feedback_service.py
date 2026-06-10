"""Unit tests for feedback service and submit validation."""
import pytest
from unittest.mock import AsyncMock, MagicMock

import services.feedback_service as feedback_service


@pytest.mark.asyncio
async def test_create_feedback_persists_user_scoped_document():
    mock_coll = MagicMock()
    mock_coll.insert_one = AsyncMock(return_value=MagicMock(inserted_id="oid"))

    mock_db = MagicMock()
    mock_db.feedback = mock_coll
    feedback_service.db = mock_db

    result = await feedback_service.create_feedback(
        user_id="user-1",
        user_name="Tester",
        feedback_type="general",
        message="Needs darker theme",
    )

    assert result["user_id"] == "user-1"
    assert result["message"] == "Needs darker theme"
    assert result["status"] == "new"
    mock_coll.insert_one.assert_awaited_once()
    inserted = mock_coll.insert_one.call_args[0][0]
    assert inserted["user_id"] == "user-1"
    assert inserted["id"] == result["id"]


@pytest.mark.asyncio
async def test_get_user_feedback_queries_by_user_id():
    items = [{"id": "fb-1", "user_id": "user-1", "message": "hello"}]
    mock_cursor = MagicMock()
    mock_cursor.sort = MagicMock(return_value=mock_cursor)
    mock_cursor.to_list = AsyncMock(return_value=items)

    mock_coll = MagicMock()
    mock_coll.find = MagicMock(return_value=mock_cursor)

    mock_db = MagicMock()
    mock_db.feedback = mock_coll
    feedback_service.db = mock_db

    result = await feedback_service.get_user_feedback("user-1")

    assert result == items
    mock_coll.find.assert_called_once_with({"user_id": "user-1"}, {"_id": 0})
    mock_cursor.sort.assert_called_once_with("timestamp", -1)
