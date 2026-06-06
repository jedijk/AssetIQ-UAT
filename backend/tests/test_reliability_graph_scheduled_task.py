"""Unit tests for scheduled_task reliability graph edge sync."""
import pytest
from unittest.mock import AsyncMock, patch

from services.reliability_graph import sync_edges_for_scheduled_task


@pytest.mark.asyncio
async def test_sync_edges_for_scheduled_task_completed():
    mock_upsert = AsyncMock()
    task = {
        "id": "st-1",
        "equipment_id": "eq-1",
        "maintenance_program_id": "pt-1",
        "failure_mode_id": "fm-1",
        "task_name": "Inspect seal",
        "strategy_id": "str-1",
        "strategy_version": "3",
    }
    with patch("services.reliability_graph.upsert_edge", mock_upsert):
        result = await sync_edges_for_scheduled_task(
            task,
            event="completed",
            metadata={"completed_at": "2026-06-06T12:00:00"},
        )

    assert result["edges_upserted"] == 4
    relations = [call.kwargs["relation"] for call in mock_upsert.await_args_list]
    assert "derived_from" in relations
    assert "scheduled_for" in relations
    assert "mitigates_failure_mode" in relations
    assert "completed_on" in relations


@pytest.mark.asyncio
async def test_sync_edges_for_scheduled_task_cancelled():
    mock_upsert = AsyncMock()
    task = {
        "id": "st-2",
        "equipment_id": "eq-2",
        "maintenance_program_id": "pt-2",
        "task_name": "Lubricate bearing",
    }
    with patch("services.reliability_graph.upsert_edge", mock_upsert):
        result = await sync_edges_for_scheduled_task(task, event="cancelled")

    assert result["edges_upserted"] == 3
    relations = [call.kwargs["relation"] for call in mock_upsert.await_args_list]
    assert "cancelled_for" in relations
