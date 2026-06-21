"""Programs summary endpoint — v2 source with legacy response fields."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from routes.maintenance_scheduler.programs import get_programs_summary


class _EquipmentCursor:
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


@pytest.mark.asyncio
async def test_programs_summary_includes_legacy_ui_fields():
    v2_programs = [
        {
            "equipment_id": "eq-1",
            "equipment_name": "Pump A",
            "equipment_tag": "P-001",
            "tasks": [
                {"id": "t1", "is_active": True},
                {"id": "t2", "is_active": False},
            ],
        },
        {
            "equipment_id": "eq-2",
            "equipment_name": "Pump B",
            "equipment_tag": "P-002",
            "tasks": [{"id": "t3", "is_active": True}],
        },
    ]

    mock_db = MagicMock()
    mock_db.maintenance_programs_v2.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=v2_programs))
    )
    mock_db.equipment_nodes.find = MagicMock(
        return_value=_EquipmentCursor(
            [
                {"id": "eq-1", "name": "Pump A", "tag": "P-001"},
                {"id": "eq-2", "name": "Pump B", "tag": "P-002"},
            ]
        )
    )
    mock_db.scheduled_tasks.count_documents = AsyncMock(return_value=2)

    async def _count_active(equipment_id, v2_tasks, **kwargs):
        return sum(1 for task in v2_tasks if task.get("is_active", True))

    with (
        patch("services.maintenance_scheduler_service.db", mock_db),
        patch(
            "services.maintenance_program_pm_import.count_active_tasks_for_equipment_program",
            side_effect=_count_active,
        ),
    ):
        result = await get_programs_summary("et-1", current_user={"id": "u1"})

    assert result["equipment_count"] == 2
    assert result["total_program_tasks"] == 2
    assert result["total_programs"] == 2
    assert result["overdue_count"] == 2
    assert len(result["equipment"]) == 2
    assert result["equipment"] == result["equipment_summary"]
    assert result["equipment"][0]["task_count"] == 1
    assert result["source"] == "maintenance_programs_v2"
