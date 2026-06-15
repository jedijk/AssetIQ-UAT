"""PM import graph sync must route through dispatch_graph_sync."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_pm_import_graph_sync_uses_dispatch():
    from services.pm_import_graph_sync import sync_pm_import_graph_edge

    mock_dispatch = AsyncMock()
    task = {
        "equipment_match": {"equipment_id": "eq-1", "equipment_type_id": "et-1"},
        "tenant_id": "tenant-a",
    }
    with patch("services.reliability_graph.dispatch_graph_sync", mock_dispatch):
        await sync_pm_import_graph_edge(task, "task-1", "fm-1", "added")

    mock_dispatch.assert_awaited_once()
    assert mock_dispatch.await_args.args[0] == "sync_edge_for_pm_import_task"
    kwargs = mock_dispatch.await_args.kwargs
    assert kwargs["task_id"] == "task-1"
    assert kwargs["failure_mode_id"] == "fm-1"
    assert kwargs["tenant_id"] == "tenant-a"
