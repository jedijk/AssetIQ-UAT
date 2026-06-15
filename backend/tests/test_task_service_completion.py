"""Task completion submodule — observation mirror and graph helpers."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.task_service_completion import create_observation_from_task

USER = {"company_id": "co-1", "id": "user-1"}


@pytest.mark.asyncio
async def test_create_observation_from_task_mirrors_threat():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.threats.insert_one = AsyncMock()

    task_instance = {
        "_id": "ti-1",
        "task_template_name": "Inspect pump",
        "equipment_name": "Pump A",
        "equipment_id": "eq-1",
        "tenant_id": "co-1",
    }
    completion_data = {
        "issues_found": ["Oil leak"],
        "issue_severity": "high",
        "create_observation": True,
    }
    now = datetime.now(timezone.utc)

    with patch("services.threat_observation_bridge.sync_threat_mirror", new_callable=AsyncMock) as mirror, patch(
        "services.reliability_graph.dispatch_graph_sync", new_callable=AsyncMock
    ):
        obs_id = await create_observation_from_task(
            mock_db, task_instance, completion_data, now, user=USER
        )

    assert obs_id
    mock_db.threats.insert_one.assert_called_once()
    inserted = mock_db.threats.insert_one.call_args[0][0]
    assert inserted["tenant_id"] == "co-1"
    mirror.assert_awaited_once()
    assert mirror.call_args[0][0]["id"] == obs_id
