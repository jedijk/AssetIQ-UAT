"""Count maintenance programs affected by strategy task template edits."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

import pytest

from services.program_task_resolution import count_active_maintenance_programs_for_task_template


@pytest.mark.asyncio
async def test_count_active_programs_for_linked_task():
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
                    "traceability": {"task_template_id": "tmpl-2"},
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

    with (
        patch("services.program_task_resolution.db", mock_db),
        patch(
            "services.scheduler_config.should_read_legacy_maintenance_programs",
            return_value=False,
        ),
    ):
        count = await count_active_maintenance_programs_for_task_template(
            "etype-1",
            "tmpl-1",
        )

    assert count == 1
