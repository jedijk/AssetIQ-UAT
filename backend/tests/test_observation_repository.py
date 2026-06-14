"""Tests for observation repository cascade delete."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from repositories.observation_repository import delete_observation_cascade, find_observation_by_id


@pytest.mark.asyncio
async def test_find_observation_by_logical_id():
    mock_db = MagicMock()
    mock_db.observations.find_one = AsyncMock(return_value={"id": "obs-1", "_id": "x"})
    with patch("repositories.observation_repository.db", mock_db):
        doc = await find_observation_by_id("obs-1")
    assert doc["id"] == "obs-1"


@pytest.mark.asyncio
async def test_delete_observation_cascade_not_found():
    mock_db = MagicMock()
    mock_db.observations.find_one = AsyncMock(return_value=None)
    with patch("repositories.observation_repository.db", mock_db):
        with pytest.raises(ValueError, match="not_found"):
            await delete_observation_cascade(obs_id="missing")
