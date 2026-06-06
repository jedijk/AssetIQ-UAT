"""Unit tests for PM Import reliability graph edge sync."""
import pytest
from unittest.mock import AsyncMock, patch

from services.reliability_graph import sync_edge_for_pm_import_task


@pytest.mark.asyncio
async def test_sync_edge_for_pm_import_task_calls_upsert_edge():
    mock_upsert = AsyncMock()
    with patch("services.reliability_graph.upsert_edge", mock_upsert):
        await sync_edge_for_pm_import_task(
            task_id="task-123",
            failure_mode_id="fm-456",
        )

    mock_upsert.assert_awaited_once_with(
        source_type="pm_import_task",
        source_id="task-123",
        relation="applied_to",
        target_type="failure_mode",
        target_id="fm-456",
        equipment_id=None,
        equipment_type_id=None,
        metadata={"apply_mode": "added"},
    )


@pytest.mark.asyncio
async def test_sync_edge_for_pm_import_task_passes_optional_fields():
    mock_upsert = AsyncMock()
    with patch("services.reliability_graph.upsert_edge", mock_upsert):
        await sync_edge_for_pm_import_task(
            task_id="task-789",
            failure_mode_id="fm-abc",
            equipment_id="eq-1",
            equipment_type_id="et-2",
            apply_mode="merged",
        )

    mock_upsert.assert_awaited_once_with(
        source_type="pm_import_task",
        source_id="task-789",
        relation="applied_to",
        target_type="failure_mode",
        target_id="fm-abc",
        equipment_id="eq-1",
        equipment_type_id="et-2",
        metadata={"apply_mode": "merged"},
    )
