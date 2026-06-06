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
        tenant_id=None,
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
        tenant_id=None,
        metadata={"apply_mode": "merged"},
    )


@pytest.mark.asyncio
async def test_apply_task_to_failure_mode_syncs_graph_edge_on_success():
    """apply_task_to_failure_mode calls graph edge sync on the success path."""
    from unittest.mock import MagicMock

    from services.pm_import_service import PMImportService

    mock_sessions = AsyncMock()
    service = PMImportService(MagicMock())
    service.sessions_collection = mock_sessions

    task = {
        "task_id": "task-1",
        "review_status": "accepted",
        "task_description": "Inspect bearing",
        "equipment_match": {"equipment_id": "eq-1", "equipment_type_id": "et-1"},
    }
    mock_sessions.find_one = AsyncMock(
        return_value={
            "session_id": "sess-1",
            "tasks_extracted": [task],
            "created_by": "user-1",
        }
    )
    mock_sessions.update_one = AsyncMock()

    apply_result = {
        "success": True,
        "mode": "added",
        "failure_mode_id": "fm-1",
    }
    mock_sync = AsyncMock()

    with patch.object(service, "_apply_task_to_failure_mode", AsyncMock(return_value=apply_result)):
        with patch.object(service, "_sync_pm_import_graph_edge", mock_sync):
            result = await service.apply_task_to_failure_mode(
                session_id="sess-1",
                task_id="task-1",
                target_failure_mode_id="fm-1",
                user_id="user-1",
            )

    mock_sync.assert_awaited_once_with(
        task,
        "task-1",
        "fm-1",
        "added",
    )
    assert result["success"] is True
