"""Unit tests for cross-environment user updates (terms acceptance fix)."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import database
from database import update_user_by_id


class _FakeUpdateResult:
    def __init__(self, matched_count: int):
        self.matched_count = matched_count


@pytest.mark.asyncio
async def test_update_user_by_id_uses_request_db_when_present():
    request_db = MagicMock()
    request_db.name = "assetiq-UAT"
    request_db.users.update_one = AsyncMock(
        return_value=_FakeUpdateResult(matched_count=1)
    )

    with patch.object(database, "get_request_db", return_value=request_db):
        result = await update_user_by_id("user-1", {"terms_accepted_version": "1.0"})

    assert result.matched_count == 1
    request_db.users.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_user_by_id_falls_back_to_production():
    request_db = MagicMock()
    request_db.name = "assetiq-UAT"
    request_db.users.update_one = AsyncMock(
        return_value=_FakeUpdateResult(matched_count=0)
    )

    prod_db = MagicMock()
    prod_db.users.update_one = AsyncMock(
        return_value=_FakeUpdateResult(matched_count=1)
    )

    fake_client = MagicMock()
    fake_client.__getitem__ = MagicMock(return_value=prod_db)

    with patch.object(database, "get_request_db", return_value=request_db), patch.object(
        database, "client", fake_client
    ), patch.object(database, "get_production_db_name", return_value="assetiq"):
        result = await update_user_by_id("user-1", {"terms_accepted_version": "1.0"})

    assert result.matched_count == 1
    prod_db.users.update_one.assert_awaited_once()
