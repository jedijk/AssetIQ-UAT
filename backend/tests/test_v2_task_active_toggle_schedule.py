"""Schedule sync when a v2 maintenance program task is enabled or disabled."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from services.maintenance_scheduler_sync import (
    _cancel_open_scheduled_for_v2_task,
    refresh_schedule_after_v2_task_active_toggle,
)


@pytest.mark.asyncio
async def test_cancel_open_scheduled_for_v2_task_uses_v2_and_legacy_ids():
    mock_db = MagicMock()
    mock_db.maintenance_programs.find_one = AsyncMock(
        return_value={"id": "legacy-prog-1"}
    )
    mock_db.scheduled_tasks.update_many = AsyncMock(
        side_effect=[
            MagicMock(modified_count=2),
            MagicMock(modified_count=1),
        ]
    )

    with patch("services.maintenance_scheduler_sync.db", mock_db):
        cancelled = await _cancel_open_scheduled_for_v2_task(
            "eq-1",
            "v2-task-1",
            template_id="tmpl-1",
        )

    assert cancelled == 3
    first_call = mock_db.scheduled_tasks.update_many.await_args_list[0][0][0]
    assert first_call["maintenance_program_id"] == {"$in": ["v2-task-1", "legacy-prog-1"]}
    second_call = mock_db.scheduled_tasks.update_many.await_args_list[1][0][0]
    assert second_call["equipment_id"] == "eq-1"
    assert second_call["v2_task_id"] == "v2-task-1"
    assert second_call["status"] == {"$nin": ["completed", "cancelled"]}


@pytest.mark.asyncio
async def test_refresh_schedule_enable_schedules_target_program():
    program_row = {"id": "v2-task-1", "v2_task_id": "v2-task-1", "equipment_id": "eq-1"}

    with patch(
        "services.maintenance_scheduler_sync.should_sync_legacy_maintenance_programs",
        return_value=False,
    ), patch(
        "services.scheduler_program_source.load_schedulable_programs",
        new=AsyncMock(return_value=[program_row]),
    ) as load_programs, patch(
        "services.maintenance_scheduling.schedule_program",
        new=AsyncMock(return_value=["st-1", "st-2"]),
    ) as schedule_program:
        result = await refresh_schedule_after_v2_task_active_toggle(
            "eq-1",
            "v2-task-1",
            enable=True,
        )

    load_programs.assert_awaited_once_with(equipment_ids=["eq-1"])
    schedule_program.assert_awaited_once_with(program_row)
    assert result["scheduled_tasks_created"] == 2


@pytest.mark.asyncio
async def test_refresh_schedule_disable_cancels_without_legacy_sync():
    mock_db = MagicMock()
    mock_db.maintenance_programs.find_one = AsyncMock(return_value=None)
    mock_db.scheduled_tasks.update_many = AsyncMock(
        side_effect=[
            MagicMock(modified_count=4),
            MagicMock(modified_count=0),
        ]
    )

    with patch(
        "services.maintenance_scheduler_sync.db",
        mock_db,
    ), patch(
        "services.maintenance_scheduler_sync.should_sync_legacy_maintenance_programs",
        return_value=False,
    ):
        result = await refresh_schedule_after_v2_task_active_toggle(
            "eq-1",
            "v2-task-1",
            enable=False,
        )

    assert result["scheduled_tasks_cancelled"] == 4
    assert "scheduled_tasks_created" not in result
