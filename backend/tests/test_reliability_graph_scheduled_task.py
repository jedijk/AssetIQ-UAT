"""Unit tests for scheduled_task reliability graph edge sync."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.program_task_resolution import resolve_program_task_id
from services.reliability_graph import sync_edges_for_scheduled_task


@pytest.mark.asyncio
async def test_resolve_program_task_id_prefers_v2_task_id():
    assert await resolve_program_task_id(
        {"maintenance_program_id": "legacy-1", "v2_task_id": "v2-task-1"}
    ) == "v2-task-1"


@pytest.mark.asyncio
async def test_resolve_program_task_id_v2_program_source():
    assert await resolve_program_task_id(
        {
            "maintenance_program_id": "task-abc",
            "program_source": "v2",
        }
    ) == "task-abc"


@pytest.mark.asyncio
async def test_resolve_program_task_id_legacy_lookup():
    mock_db = MagicMock()
    mock_db.maintenance_programs.find_one = AsyncMock(
        return_value={"v2_task_id": "resolved-v2"}
    )
    mock_db.maintenance_programs_v2.find_one = AsyncMock(return_value=None)
    with patch("services.program_task_resolution.db", mock_db):
        result = await resolve_program_task_id(
            {"maintenance_program_id": "legacy-row-id", "program_source": "legacy"}
        )
    assert result == "resolved-v2"


@pytest.mark.asyncio
async def test_sync_edges_for_scheduled_task_completed_legacy_program_id():
    mock_upsert = AsyncMock()
    task = {
        "id": "st-1",
        "equipment_id": "eq-1",
        "maintenance_program_id": "legacy-id",
        "v2_task_id": "pt-correct",
        "failure_mode_id": "fm-1",
        "task_name": "Inspect seal",
        "strategy_id": "str-1",
        "strategy_version": "3",
    }
    with patch("services.reliability_graph_strategy.upsert_edge", mock_upsert):
        result = await sync_edges_for_scheduled_task(
            task,
            event="completed",
            metadata={"completed_at": "2026-06-06T12:00:00"},
        )

    assert result["edges_upserted"] == 4
    derived = [
        c
        for c in mock_upsert.await_args_list
        if c.kwargs.get("relation") == "derived_from"
    ]
    assert derived[0].kwargs["target_id"] == "pt-correct"


@pytest.mark.asyncio
async def test_sync_edges_for_scheduled_task_cancelled_v2_source():
    mock_upsert = AsyncMock()
    task = {
        "id": "st-2",
        "equipment_id": "eq-2",
        "maintenance_program_id": "v2-task-9",
        "program_source": "v2",
        "task_name": "Lubricate bearing",
    }
    with patch("services.reliability_graph_strategy.upsert_edge", mock_upsert):
        result = await sync_edges_for_scheduled_task(task, event="cancelled")

    assert result["edges_upserted"] == 3
    cancelled = [
        c
        for c in mock_upsert.await_args_list
        if c.kwargs.get("relation") == "cancelled_for"
    ]
    assert cancelled[0].kwargs["target_id"] == "v2-task-9"


@pytest.mark.asyncio
async def test_sync_edges_for_scheduled_task_created_event():
    mock_upsert = AsyncMock()
    task = {
        "id": "st-3",
        "equipment_id": "eq-3",
        "maintenance_program_id": "pt-3",
        "v2_task_id": "pt-3",
        "task_name": "Check filter",
    }
    with patch("services.reliability_graph_strategy.upsert_edge", mock_upsert):
        result = await sync_edges_for_scheduled_task(task, event="created")

    assert result["edges_upserted"] == 2
    relations = {c.kwargs.get("relation") for c in mock_upsert.await_args_list}
    assert "derived_from" in relations
    assert "scheduled_for" in relations
    assert "completed_on" not in relations


@pytest.mark.asyncio
async def test_sync_edges_for_scheduled_task_links_pm_import_task():
    mock_upsert = AsyncMock()
    mock_pm_links = AsyncMock(return_value=2)
    task = {
        "id": "st-4",
        "equipment_id": "eq-4",
        "maintenance_program_id": "pt-4",
        "v2_task_id": "pt-4",
        "pm_import_task_id": "sess-9:task-9",
        "failure_mode_id": "fm-9",
        "task_name": "Imported lube",
    }
    with patch("services.reliability_graph_strategy.upsert_edge", mock_upsert), patch(
        "services.reliability_graph_strategy.sync_pm_import_program_task_links", mock_pm_links
    ):
        result = await sync_edges_for_scheduled_task(task, event="created")

    assert result["edges_upserted"] == 5
    mock_pm_links.assert_awaited_once()
    assert mock_pm_links.await_args.kwargs["pm_import_task_id"] == "sess-9:task-9"
    assert mock_pm_links.await_args.kwargs["program_task_id"] == "pt-4"
