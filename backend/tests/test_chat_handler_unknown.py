"""Unit tests for operator 'I don't know' selections in chat_handler_v2."""

import pytest

from chat_handler_v2 import ChatState, process_chat_message
from failure_modes import FAILURE_MODES_LIBRARY


@pytest.mark.asyncio
async def test_awaiting_equipment_unknown_sets_placeholder_and_advances():
    result = await process_chat_message(
        db=None,
        user_id="u1",
        message_content="Equipment: I don't know",
        failure_modes_library=FAILURE_MODES_LIBRARY,
        current_state=ChatState.AWAITING_EQUIPMENT,
        pending_data={"original_description": "bearing noise on line 3"},
        prev_equipment_suggestions=[{"id": "e1", "name": "Pump A", "tag": "P-100"}],
        original_message="bearing noise on line 3",
    )
    assert result["pending_data"].get("equipment_name") == "Unknown equipment"
    assert result["pending_data"].get("equipment_id") is None
    assert result["state"] in (ChatState.COMPLETE, ChatState.AWAITING_FAILURE_MODE)


@pytest.mark.asyncio
async def test_awaiting_failure_mode_unknown_records_custom():
    pending = {
        "original_description": "leak",
        "equipment": {"id": "e1", "name": "Pump A", "tag": "P-100"},
        "equipment_id": "e1",
        "equipment_name": "Pump A",
        "equipment_type": "Pump",
        "installation_id": None,
    }
    result = await process_chat_message(
        db=None,
        user_id="u1",
        message_content="Failure mode: I don't know",
        failure_modes_library=FAILURE_MODES_LIBRARY,
        current_state=ChatState.AWAITING_FAILURE_MODE,
        pending_data=pending,
        prev_failure_mode_suggestions=[
            {"id": "fm1", "failure_mode": "Seal leak", "rpn": 80},
        ],
        original_message="leak",
    )
    assert result["state"] == ChatState.COMPLETE
    assert result.get("create_observation") is True
    assert result["pending_data"]["failure_mode_name"] == "Unknown / not specified"
    assert result["pending_data"].get("is_custom_failure_mode") is True
