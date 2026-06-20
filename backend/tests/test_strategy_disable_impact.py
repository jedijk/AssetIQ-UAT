"""Impact preview and propagation helpers for disabling maintenance strategies."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from services.maintenance_strategy_propagation import (
    count_active_programs_for_strategy,
    count_open_scheduled_tasks_for_strategy,
    is_status_only_strategy_update,
)
from models.maintenance_strategy_v2 import UpdateEquipmentTypeStrategyRequest


@pytest.mark.asyncio
async def test_count_active_programs_for_strategy():
    programs = [
        {
            "equipment_id": "eq-1",
            "status": "active",
            "tasks": [
                {
                    "id": "pt-1",
                    "is_active": True,
                    "traceability": {"task_template_id": "tmpl-1"},
                }
            ],
        },
        {
            "equipment_id": "eq-2",
            "status": "active",
            "tasks": [
                {
                    "id": "pt-2",
                    "is_active": False,
                    "traceability": {"task_template_id": "tmpl-1"},
                }
            ],
        },
        {
            "equipment_id": "eq-3",
            "status": "active",
            "tasks": [
                {
                    "id": "pt-3",
                    "is_active": True,
                    "traceability": {},
                }
            ],
        },
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
    mock_db.maintenance_programs_v2.find = MagicMock(return_value=_Cursor(programs))

    with patch(
        "services.maintenance_strategy_propagation.db",
        mock_db,
    ), patch(
        "services.scheduler_config.should_read_legacy_maintenance_programs",
        return_value=False,
    ):
        count = await count_active_programs_for_strategy("etype-1")

    assert count == 1


@pytest.mark.asyncio
async def test_count_open_scheduled_tasks_for_strategy():
    with patch(
        "services.maintenance_strategy_propagation.strategy_program_task_ids_for_equipment_type",
        new=AsyncMock(return_value=["prog-1", "prog-2"]),
    ), patch(
        "services.maintenance_strategy_propagation.db",
    ) as mock_db:
        mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=3)
        count = await count_open_scheduled_tasks_for_strategy("etype-1")

    assert count == 3
    mock_db.scheduled_tasks.count_documents.assert_awaited_once()
    query = mock_db.scheduled_tasks.count_documents.call_args[0][0]
    assert "$or" in query
    assert any(part.get("strategy_id") == "etype-1" for part in query["$or"])


def test_is_status_only_strategy_update():
    assert is_status_only_strategy_update(
        UpdateEquipmentTypeStrategyRequest(status="disabled")
    )
    assert not is_status_only_strategy_update(
        UpdateEquipmentTypeStrategyRequest(status="disabled", description="x")
    )


@pytest.mark.asyncio
async def test_resync_programs_with_strategy_disabled_deactivates_all_tasks():
    from models.maintenance_program import TaskSource
    from services.strategy_propagation import resync_programs_with_strategy

    strategy = {
        "equipment_type_id": "etype-1",
        "status": "disabled",
        "task_templates": [{"id": "tmpl-1", "task_type": "preventive", "is_mandatory": True}],
        "failure_mode_strategies": [],
    }
    program = {
        "_id": "mongo-1",
        "equipment_type_id": "etype-1",
        "tasks": [
            {
                "id": "pt-1",
                "task_source": TaskSource.STRATEGY_GENERATED.value,
                "is_active": True,
                "traceability": {"task_template_id": "tmpl-1"},
            }
        ],
    }

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=strategy)
    mock_db.maintenance_programs_v2.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[program]))
    )
    mock_db.maintenance_programs_v2.update_one = AsyncMock()
    mock_db.scheduled_tasks.update_many = AsyncMock(
        return_value=MagicMock(modified_count=2)
    )

    with patch("services.strategy_propagation.db", mock_db), patch(
        "services.scheduler_config.should_sync_legacy_maintenance_programs",
        return_value=False,
    ):
        result = await resync_programs_with_strategy("etype-1")

    assert result["programs_deactivated"] == 1
    mock_db.maintenance_programs_v2.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_active_strategy_type_ids_excludes_disabled():
    from services.scheduler_program_source import get_active_strategy_type_ids

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
    mock_db.equipment_type_strategies.find = MagicMock(
        return_value=_Cursor([{"equipment_type_id": "active-type"}])
    )

    with patch("services.scheduler_program_source.db", mock_db):
        ids = await get_active_strategy_type_ids()

    assert ids == {"active-type"}
    query = mock_db.equipment_type_strategies.find.call_args[0][0]
    assert query == {"$nor": [{"status": "disabled"}]}


@pytest.mark.asyncio
async def test_delete_open_scheduled_tasks_for_strategy_matches_strategy_id_orphans():
    from services.maintenance_strategy_propagation import (
        _delete_open_scheduled_tasks_for_strategy,
    )

    with patch(
        "services.maintenance_strategy_propagation.strategy_program_task_ids_for_equipment_type",
        new=AsyncMock(return_value=["v2-task-1"]),
    ), patch(
        "services.maintenance_strategy_propagation.db",
    ) as mock_db:
        mock_db.scheduled_tasks.delete_many = AsyncMock(
            return_value=MagicMock(deleted_count=4)
        )
        removed = await _delete_open_scheduled_tasks_for_strategy("etype-1")

    assert removed == 4
    query = mock_db.scheduled_tasks.delete_many.call_args[0][0]
    assert "$or" in query
    id_clause = next(part for part in query["$or"] if "$or" in part)
    assert {"maintenance_program_id": {"$in": ["v2-task-1"]}} in id_clause["$or"]
    assert {"v2_task_id": {"$in": ["v2-task-1"]}} in id_clause["$or"]
    strategy_clause = next(
        part for part in query["$or"] if part.get("strategy_id") == "etype-1"
    )
    assert strategy_clause["status"] == {"$nin": ["completed", "cancelled"]}


@pytest.mark.asyncio
async def test_scope_does_not_leak_strategy_tasks_via_equipment_id():
    """Import schedulable rows must not expose unrelated strategy scheduled tasks."""
    from services.maintenance_scheduler_scope import scope_scheduled_tasks_query

    query = {
        "due_date": {"$gte": "2026-01-01", "$lte": "2026-12-31"},
        "status": {"$nin": ["cancelled"]},
    }
    rows = [{"id": "import-prog-1", "equipment_id": "eq-bearings"}]

    with patch(
        "services.maintenance_scheduler_scope.load_schedulable_program_rows",
        new=AsyncMock(return_value=rows),
    ):
        await scope_scheduled_tasks_query(query, equipment_type_id="bearings-type")

    scope = query["$and"][1]
    assert scope == {"maintenance_program_id": {"$in": ["import-prog-1"]}}
    assert "equipment_id" not in str(scope)
