"""PM import active-state sync between program panel, sessions, schedule, and summary."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from models.maintenance_program import TaskSource
from services.maintenance_program_pm_import import (
    count_active_tasks_for_equipment_program,
    enrich_program_response_with_pm_import,
    fetch_pm_import_tasks_for_equipment,
    is_incorporated_pm_program_task,
    parse_pm_import_ref,
    propagate_pm_import_task_active_state,
    purge_standalone_pm_import_program_task,
)
from services.maintenance_program_service import MaintenanceProgramService
from services.maintenance_scheduler_disabled import load_inactive_program_task_keys
from services.scheduler_program_source import load_pm_import_scheduler_rows


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


def test_is_incorporated_pm_program_task_by_display_status():
    assert is_incorporated_pm_program_task({"pm_import_display_status": "merged"}) is True
    assert is_incorporated_pm_program_task({"pm_import_display_status": "pending"}) is False


def test_scheduleable_imported_pm_task_false_when_incorporated():
    task = {
        "task_source": TaskSource.CUSTOMER_IMPORTED.value,
        "is_active": True,
        "task_type": "pm",
        "pm_import_display_status": "merged",
    }
    assert MaintenanceProgramService._is_scheduleable_imported_pm_task(task) is False


@pytest.mark.asyncio
async def test_fetch_pm_import_tasks_skips_incorporated():
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
    mock_db.equipment_nodes.find_one = AsyncMock(return_value={"tag": "P-101"})
    mock_db.pm_import_sessions.find = MagicMock(
        return_value=_Cursor(
            [
                {
                    "session_id": "sess-1",
                    "tasks_extracted": [
                        {
                            "task_id": "task-1",
                            "import_status": "merged",
                            "review_status": "accepted",
                            "equipment_match": {"equipment_id": "eq-1"},
                        },
                        {
                            "task_id": "task-2",
                            "import_status": "pending",
                            "review_status": "accepted",
                            "equipment_match": {"equipment_id": "eq-1"},
                        },
                    ],
                }
            ]
        )
    )

    with patch("services.maintenance_program_pm_import.db", mock_db):
        tasks = await fetch_pm_import_tasks_for_equipment("eq-1")

    assert len(tasks) == 1
    assert tasks[0]["traceability"]["pm_import_task_id"] == "sess-1:task-2"


@pytest.mark.asyncio
async def test_enrich_program_strips_incorporated_customer_imported_tasks():
    stored_program = {
        "equipment_id": "eq-1",
        "tasks": [
            {
                "id": "pm-import:sess-1:task-1",
                "task_source": TaskSource.CUSTOMER_IMPORTED.value,
                "traceability": {"pm_import_task_id": "sess-1:task-1"},
            },
            {
                "id": "strategy-1",
                "task_source": TaskSource.STRATEGY_GENERATED.value,
            },
        ],
    }

    mock_db = MagicMock()
    mock_db.maintenance_programs_v2.update_one = AsyncMock()
    mock_db.equipment_nodes.find_one = AsyncMock(return_value={"name": "Pump", "tag": "P-101"})

    with (
        patch("services.maintenance_program_pm_import.db", mock_db),
        patch(
            "services.maintenance_program_pm_import.load_incorporated_pm_refs_for_equipment",
            AsyncMock(return_value={"sess-1:task-1"}),
        ),
        patch(
            "services.maintenance_program_pm_import.fetch_pm_import_tasks_for_equipment",
            AsyncMock(return_value=[]),
        ),
    ):
        program, has_stored, added = await enrich_program_response_with_pm_import(
            stored_program,
            "eq-1",
        )

    assert has_stored is True
    assert added == 0
    assert len(program["tasks"]) == 1
    assert program["tasks"][0]["id"] == "strategy-1"
    mock_db.maintenance_programs_v2.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_load_pm_import_scheduler_rows_skips_incorporated():
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
    mock_db.pm_import_sessions.find = MagicMock(
        return_value=_Cursor(
            [
                {
                    "session_id": "sess-1",
                    "file_name": "import.xlsx",
                    "tasks_extracted": [
                        {
                            "task_id": "task-1",
                            "import_status": "applied",
                            "review_status": "accepted",
                            "frequency": "monthly",
                            "equipment_match": {"equipment_id": "eq-1"},
                        }
                    ],
                }
            ]
        )
    )
    mock_db.equipment_nodes.find_one = AsyncMock(
        return_value={
            "id": "eq-1",
            "name": "Pump",
            "tag": "P-101",
            "criticality": "medium",
            "equipment_type_id": "etype-1",
            "equipment_type_name": "Pump",
        }
    )

    with patch("services.scheduler_program_source.db", mock_db):
        rows = await load_pm_import_scheduler_rows(equipment_ids=["eq-1"])

    assert rows == []


@pytest.mark.asyncio
async def test_purge_standalone_pm_import_program_task():
    mock_db = MagicMock()
    mock_db.maintenance_programs_v2.find_one = AsyncMock(
        return_value={
            "tasks": [
                {
                    "id": "pm-import:sess-1:task-1",
                    "task_source": TaskSource.CUSTOMER_IMPORTED.value,
                    "traceability": {"pm_import_task_id": "sess-1:task-1"},
                },
                {
                    "id": "strategy-1",
                    "task_source": TaskSource.STRATEGY_GENERATED.value,
                },
            ]
        }
    )
    mock_db.maintenance_programs_v2.update_one = AsyncMock()
    mock_db.maintenance_programs.delete_many = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )
    mock_db.scheduled_tasks.update_many = AsyncMock(
        return_value=MagicMock(modified_count=2)
    )

    with patch("services.maintenance_program_pm_import.db", mock_db):
        result = await purge_standalone_pm_import_program_task("eq-1", "sess-1:task-1")

    assert result["v2_tasks_removed"] == 1
    assert result["legacy_programs_deleted"] == 1
    assert result["scheduled_tasks_cancelled"] == 2
    mock_db.maintenance_programs_v2.update_one.assert_awaited_once()
