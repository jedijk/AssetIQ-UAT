"""My Tasks action completion mirrors threats to observations."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.my_tasks_service import complete_action

USER = {"id": "user-1", "company_id": "co-1", "name": "Tester"}


@pytest.mark.asyncio
async def test_complete_action_mirrors_created_threat():
    mock_db = MagicMock()
    actions = MagicMock()
    threats = MagicMock()
    mock_db.central_actions = actions
    mock_db.threats = threats
    actions.find_one = AsyncMock(return_value={"id": "act-1", "title": "Fix seal", "created_by": "user-1"})
    actions.update_one = AsyncMock()
    threats.insert_one = AsyncMock()

    data = {
        "create_observation": True,
        "issues_found": ["Seal worn"],
        "issue_severity": "medium",
    }

    with patch("services.my_tasks_service.db", mock_db), patch(
        "services.threat_observation_bridge.sync_threat_mirror", AsyncMock()
    ) as mirror, patch(
        "services.observation_mitigation.build_action_plan_completion_notification",
        AsyncMock(return_value=None),
    ):
        await complete_action(USER, "act-1", data)

    threats.insert_one.assert_called_once()
    mirror.assert_awaited_once()
    assert mirror.call_args.kwargs.get("user") == USER
