"""Tests for atomic central action_number allocation."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.action_number_service import allocate_central_action_number


@pytest.mark.asyncio
async def test_allocate_central_action_number_increments_counter():
    mock_db = MagicMock()
    mock_db.central_actions.count_documents = AsyncMock(return_value=5)
    mock_db.action_counters.update_one = AsyncMock()
    mock_db.action_counters.find_one_and_update = AsyncMock(return_value={"seq": 6})

    with patch("services.action_number_service.db", mock_db):
        number = await allocate_central_action_number()

    assert number == "ACT-0006"
    mock_db.action_counters.find_one_and_update.assert_awaited_once()
