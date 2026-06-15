"""My Tasks work_signal projection on task detail."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.my_tasks_service import _attach_work_signal, get_task_detail

USER = {"id": "user-1", "company_id": "co-1"}


@pytest.mark.asyncio
async def test_attach_work_signal_from_threat_id():
    task = {"threat_id": "threat-99"}
    mock_db = MagicMock()
    threats_col = MagicMock()
    mock_db.threats = threats_col
    threats_col.find_one = AsyncMock(
        return_value={
            "id": "threat-99",
            "title": "Bearing wear",
            "status": "open",
            "risk_score": 60,
        }
    )

    with patch("services.my_tasks_service.db", mock_db):
        await _attach_work_signal(task, USER)

    assert task["work_signal"]["id"] == "threat-99"
    assert task["work_signal"]["title"] == "Bearing wear"


@pytest.mark.asyncio
async def test_get_task_detail_includes_work_signal():
    task_doc = {
        "_id": "oid-1",
        "assigned_user_id": "user-1",
        "threat_id": "threat-42",
        "title": "Inspect pump",
    }

    with patch(
        "services.my_tasks_service.resolve_task_instance",
        AsyncMock(return_value=task_doc),
    ), patch(
        "services.my_tasks_service._load_task_instance_detail",
        AsyncMock(side_effect=lambda t, *_a, **_k: t),
    ), patch(
        "services.my_tasks_service._attach_work_signal",
        AsyncMock(side_effect=lambda t, _u: t.update(
            {"work_signal": {"id": "threat-42", "title": "Vibration"}}
        )),
    ):
        result = await get_task_detail(USER, "task-1")

    assert result["work_signal"]["id"] == "threat-42"
