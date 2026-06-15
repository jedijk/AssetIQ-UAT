"""Task completion submodule — observation mirror and graph helpers."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.task_service_completion import create_observation_from_task

USER = {"company_id": "co-1", "id": "user-1"}


@pytest.mark.asyncio
async def test_create_observation_from_task_uses_create_work_signal():
    mock_db = MagicMock()

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

    create_signal = AsyncMock(return_value={"id": "sig-task-1"})

    with patch(
        "services.work_signal_lifecycle.create_work_signal",
        create_signal,
    ):
        obs_id = await create_observation_from_task(
            mock_db, task_instance, completion_data, now, user=USER
        )

    assert obs_id == "sig-task-1"
    create_signal.assert_awaited_once()
    call_kwargs = create_signal.call_args.kwargs
    assert call_kwargs["user"] == USER
    assert call_kwargs["source"] == "task_execution"
    assert call_kwargs["graph_label"] == "task_observation_create"
    signal_doc = create_signal.call_args.args[0]
    assert signal_doc["tenant_id"] == "co-1"
    assert "Oil leak" in signal_doc["description"]
