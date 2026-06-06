"""Tests for PM Import background job handlers."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.job_handlers import handle_pm_import_ai_review


def test_pm_import_ai_review_handler_requires_session_id():
    with pytest.raises(ValueError, match="session_id"):
        asyncio.run(handle_pm_import_ai_review({"payload": {}}))


@pytest.mark.asyncio
async def test_pm_import_ai_review_handler_calls_service():
    mock_service = MagicMock()
    mock_service.ai_review_accepted_tasks = AsyncMock(
        return_value={"status": "completed", "reviewed": 2}
    )

    with patch("services.pm_import_service.PMImportService", return_value=mock_service):
        result = await handle_pm_import_ai_review(
            {"payload": {"session_id": "sess-123"}}
        )

    mock_service.ai_review_accepted_tasks.assert_awaited_once_with("sess-123")
    assert result == {"status": "completed", "reviewed": 2}
