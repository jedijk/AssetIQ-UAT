"""Regression: stale skip/cancel in INITIAL state must not 500."""

import pytest
from unittest.mock import AsyncMock, patch

from chat_handler_v2 import ChatState
from routes.chat import _core_chat_process


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ["skip", "cancel", "ok", "yes"])
async def test_stale_control_command_in_initial_state_returns_empty_response(command):
    with patch("routes.chat._read_conv", new_callable=AsyncMock) as read_conv:
        read_conv.return_value = {"state": ChatState.INITIAL}
        result = await _core_chat_process("user-1", command, "session-1", "en")

    assert result.message == ""
    assert result.detected_language == "en"
    assert result.is_mixed_language is None
