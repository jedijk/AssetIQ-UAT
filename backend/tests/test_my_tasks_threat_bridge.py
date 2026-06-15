"""My Tasks action completion mirrors threats to observations."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.my_tasks_service import complete_action

USER = {"id": "user-1", "company_id": "co-1", "name": "Tester"}


@pytest.mark.asyncio
async def test_complete_action_uses_create_work_signal():
    mock_db = MagicMock()
    actions = MagicMock()
    mock_db.central_actions = actions
    actions.find_one = AsyncMock(return_value={"id": "act-1", "title": "Fix seal", "created_by": "user-1"})
    actions.update_one = AsyncMock()

    data = {
        "create_observation": True,
        "issues_found": ["Seal worn"],
        "issue_severity": "medium",
    }

    create_signal = AsyncMock(return_value={"id": "sig-action-1"})

    with patch("services.my_tasks_service.db", mock_db), patch(
        "services.work_signal_lifecycle.create_work_signal",
        create_signal,
    ), patch(
        "services.observation_mitigation.build_action_plan_completion_notification",
        AsyncMock(return_value=None),
    ):
        await complete_action(USER, "act-1", data)

    create_signal.assert_awaited_once()
    call_kwargs = create_signal.call_args.kwargs
    assert call_kwargs["user"] == USER
    assert call_kwargs["source"] == "action_execution"
    assert call_kwargs["graph_label"] == "action_observation_create"
    signal_doc = create_signal.call_args.args[0]
    assert "Seal worn" in signal_doc["description"]
