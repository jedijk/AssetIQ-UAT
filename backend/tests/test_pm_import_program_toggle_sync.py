"""PM import active-state sync between program panel, sessions, schedule, and summary."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from services.maintenance_program_pm_import import (
    count_active_tasks_for_equipment_program,
    parse_pm_import_ref,
    propagate_pm_import_task_active_state,
)
from services.maintenance_scheduler_disabled import load_inactive_program_task_keys


def test_parse_pm_import_ref_from_program_task_id():
    parsed = parse_pm_import_ref(task_id="pm-import:sess-1:task-9")
    assert parsed == ("sess-1", "task-9", "sess-1:task-9")


def test_parse_pm_import_ref_from_traceability():
    parsed = parse_pm_import_ref(
        task={
            "id": "uuid-1",
            "task_source": "customer_imported",
            "traceability": {"pm_import_task_id": "sess-2:row-3"},
        }
    )
    assert parsed == ("sess-2", "row-3", "sess-2:row-3")


@pytest.mark.asyncio
async def test_load_inactive_keys_prefers_active_v2_over_inactive_session():
    v2_docs = [
        {
            "equipment_id": "eq-1",
            "tasks": [
                {
                    "id": "uuid-1",
                    "is_active": True,
                    "traceability": {"pm_import_task_id": "sess-1:task-1"},
                }
            ],
        }
    ]

    class _Cursor:
        def __init__(self, docs):
            self._docs = docs

        def __aiter__(self):
            self._iter = iter(self._docs)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration as exc:
                raise StopAsyncIteration from exc

    mock_db = MagicMock()
    mock_db.maintenance_programs_v2.find = MagicMock(return_value=_Cursor(v2_docs))
    mock_db.pm_import_sessions.find = MagicMock(
        return_value=_Cursor(
            [
                {
                    "session_id": "sess-1",
                    "tasks_extracted": [
                        {
                            "task_id": "task-1",
                            "is_active": False,
                            "review_status": "accepted",
                            "equipment_match": {"equipment_id": "eq-1"},
                        }
                    ],
                }
            ]
        )
    )

    with patch("database.db", mock_db):
        inactive = await load_inactive_program_task_keys(["eq-1"])

    assert inactive == set()


@pytest.mark.asyncio
async def test_count_active_tasks_includes_orphan_pm_import_tasks():
    pm_task = {
        "is_active": True,
        "traceability": {"pm_import_task_id": "sess-1:task-1"},
    }

    with patch(
        "services.maintenance_program_pm_import.fetch_pm_import_tasks_for_equipment",
        AsyncMock(return_value=[pm_task]),
    ):
        count = await count_active_tasks_for_equipment_program("eq-1", [])

    assert count == 1


@pytest.mark.asyncio
async def test_propagate_pm_import_active_state_updates_session_first():
    mock_db = MagicMock()
    mock_db.pm_import_sessions.find_one = AsyncMock(
        return_value={
            "tasks_extracted": [
                {
                    "task_id": "task-1",
                    "equipment_match": {"equipment_id": "eq-1"},
                }
            ]
        }
    )
    mock_db.maintenance_programs_v2.find_one = AsyncMock(return_value=None)
    mock_db.maintenance_programs.update_many = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )
    mock_db.scheduled_tasks.update_many = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )

    mock_pm_service = MagicMock()
    mock_pm_service.update_task = AsyncMock(return_value={"tasks": [], "stats": {}})

    with (
        patch("services.maintenance_program_pm_import.db", mock_db),
        patch(
            "services.pm_import_service.PMImportService",
            return_value=mock_pm_service,
        ),
        patch(
            "services.maintenance_program_pm_import.reschedule_pm_import_task_occurrences",
            AsyncMock(return_value={"scheduled_tasks_restored": 0, "scheduled_tasks_created": 0}),
        ),
    ):
        await propagate_pm_import_task_active_state("sess-1", "task-1", True)

    mock_pm_service.update_task.assert_awaited_once_with(
        "sess-1",
        "task-1",
        {"is_active": True},
    )
