"""Fast-path scheduling for PM import task enable/disable toggles."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from services.maintenance_program_pm_import import (
    PM_IMPORT_DISABLE_CANCEL_NOTE,
    reschedule_pm_import_task_occurrences,
)


@pytest.mark.asyncio
async def test_reschedule_restores_cancelled_tasks():
    mock_db = MagicMock()
    mock_db.scheduled_tasks.update_many = AsyncMock(
        return_value=MagicMock(modified_count=12),
    )

    with patch("services.maintenance_program_pm_import.db", mock_db):
        result = await reschedule_pm_import_task_occurrences("eq-1", "sess:task-1")

    assert result == {"scheduled_tasks_restored": 12, "scheduled_tasks_created": 0}
    mock_db.scheduled_tasks.update_many.assert_awaited_once()
    filter_doc, update_doc = mock_db.scheduled_tasks.update_many.await_args.args
    assert filter_doc["pm_import_task_id"] == "sess:task-1"
    assert filter_doc["notes"] == PM_IMPORT_DISABLE_CANCEL_NOTE
    assert update_doc["$set"]["status"] == "scheduled"


@pytest.mark.asyncio
async def test_reschedule_schedules_when_nothing_to_restore():
    mock_db = MagicMock()
    mock_db.scheduled_tasks.update_many = AsyncMock(
        return_value=MagicMock(modified_count=0),
    )

    program = {"pm_import_task_id": "sess:task-1", "id": "pm-import:sess:task-1"}

    with (
        patch("services.maintenance_program_pm_import.db", mock_db),
        patch(
            "services.scheduler_program_source.load_schedulable_programs",
            AsyncMock(return_value=[program]),
        ),
        patch(
            "services.maintenance_scheduling.schedule_program",
            AsyncMock(return_value=["st-1", "st-2"]),
        ),
    ):
        result = await reschedule_pm_import_task_occurrences("eq-1", "sess:task-1")

    assert result == {"scheduled_tasks_restored": 0, "scheduled_tasks_created": 2}
