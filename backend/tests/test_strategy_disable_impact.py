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
        "services.maintenance_strategy_propagation.scheduler_program_ids_for_equipment_type",
        new=AsyncMock(return_value=["prog-1", "prog-2"]),
    ), patch(
        "services.maintenance_strategy_propagation.db",
    ) as mock_db:
        mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=3)
        count = await count_open_scheduled_tasks_for_strategy("etype-1")

    assert count == 3
    mock_db.scheduled_tasks.count_documents.assert_awaited_once()


def test_is_status_only_strategy_update():
    assert is_status_only_strategy_update(
        UpdateEquipmentTypeStrategyRequest(status="disabled")
    )
    assert not is_status_only_strategy_update(
        UpdateEquipmentTypeStrategyRequest(status="disabled", description="x")
    )
