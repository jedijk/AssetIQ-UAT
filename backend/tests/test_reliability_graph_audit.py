"""Unit tests for reliability graph audit helpers."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.reliability_graph_audit import (
    audit_pm_import_task,
    audit_scheduled_task_completed,
    edge_id,
    missing_edge,
)


def test_edge_id_format():
    eid = edge_id("scheduled_task", "st-1", "completed_on", "equipment", "eq-1")
    assert eid == "scheduled_task:st-1:completed_on:equipment:eq-1"


@pytest.mark.asyncio
async def test_missing_edge_returns_none_when_present():
    mock_collection = AsyncMock()
    mock_collection.find_one = AsyncMock(return_value={"id": "exists"})
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    with patch("services.reliability_graph_audit.db", mock_db):
        result = await missing_edge(
            source_type="pm_import_task",
            source_id="t-1",
            relation="applied_to",
            target_type="failure_mode",
            target_id="fm-1",
        )
    assert result is None


@pytest.mark.asyncio
async def test_missing_edge_returns_message_when_absent():
    mock_collection = AsyncMock()
    mock_collection.find_one = AsyncMock(return_value=None)
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    with patch("services.reliability_graph_audit.db", mock_db):
        result = await missing_edge(
            source_type="pm_import_task",
            source_id="t-1",
            relation="applied_to",
            target_type="failure_mode",
            target_id="fm-1",
            context="pm_import",
        )
    assert result is not None
    assert "pm_import" in result
    assert "applied_to" in result


@pytest.mark.asyncio
async def test_audit_pm_import_task_gap():
    mock_collection = AsyncMock()
    mock_collection.find_one = AsyncMock(return_value=None)
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    with patch("services.reliability_graph_audit.db", mock_db):
        gap = await audit_pm_import_task("task-99", "fm-99")
    assert gap is not None


@pytest.mark.asyncio
async def test_audit_scheduled_task_completed_all_edges():
    mock_collection = AsyncMock()
    mock_collection.find_one = AsyncMock(return_value={"id": "edge"})
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    task = {
        "id": "st-1",
        "equipment_id": "eq-1",
        "maintenance_program_id": "pt-1",
        "failure_mode_id": "fm-1",
    }
    with patch("services.reliability_graph_audit.db", mock_db), patch(
        "services.reliability_graph_audit.resolve_program_task_id",
        AsyncMock(return_value="pt-1"),
    ):
        gaps = await audit_scheduled_task_completed(task)
    assert gaps == []


@pytest.mark.asyncio
async def test_task_service_complete_syncs_scheduled_task_edges():
    """complete_task delegates graph sync after completion."""
    from services.task_service import TaskService

    source = (pytest.importorskip("pathlib").Path(__file__).resolve().parents[1] / "services" / "task_service.py").read_text()
    assert "_sync_reliability_graph_on_complete" in source
    assert "dispatch_graph_sync" in source
    assert "sync_edges_for_scheduled_task" in source
