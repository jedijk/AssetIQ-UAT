"""Unit tests for maintenance scheduler run service."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, patch

from models.maintenance_scheduler import RunSchedulerRequest
from services.maintenance_scheduler_run import run_scheduler_impl


@pytest.mark.asyncio
async def test_run_scheduler_impl_passes_user_to_loaders():
    request = RunSchedulerRequest(equipment_type_id="type-1", run_async=False)
    user = {"id": "user-1", "company_id": "tenant-abc"}

    with patch(
        "services.maintenance_scheduler_sync.cleanup_schedules_without_strategy",
        new=AsyncMock(return_value={"scheduled_tasks_deleted": 0}),
    ) as cleanup, patch(
        "services.maintenance_program_service.MaintenanceProgramService.sync_imported_program_tasks_to_scheduler",
        new=AsyncMock(),
    ) as pm_sync, patch(
        "services.scheduler_program_source.load_schedulable_programs",
        new=AsyncMock(return_value=[{"id": "prog-1"}]),
    ) as load_programs, patch(
        "services.maintenance_scheduler_run.schedule_program",
        new=AsyncMock(return_value=["task-1", "task-2"]),
    ):
        result = await run_scheduler_impl(request, user)

    cleanup.assert_awaited_once_with(equipment_type_id="type-1", user=user)
    pm_sync.assert_awaited_once_with(
        equipment_type_id="type-1",
        schedule=False,
        user=user,
    )
    load_programs.assert_awaited_once_with(equipment_type_id="type-1", user=user)
    assert result["tasks_created"] == 2
    assert result["programs_reviewed"] == 1


@pytest.mark.asyncio
async def test_schedule_program_dispatches_graph_sync_concurrently():
    program = {
        "id": "task-1",
        "equipment_id": "eq-1",
        "equipment_name": "Pump",
        "task_name": "Inspect",
        "task_type": "preventive",
        "frequency_days": 30,
        "criticality": "medium",
        "strategy_id": "type-1",
        "strategy_version": "1.0",
        "program_source": "v2",
        "v2_task_id": "task-1",
        "is_active": True,
        "tenant_id": "tenant-abc",
    }

    mock_db = AsyncMock()
    mock_db.scheduled_tasks.find = lambda *a, **k: type(
        "Cursor", (), {"to_list": AsyncMock(return_value=[])}
    )()
    mock_db.scheduled_tasks.insert_many = AsyncMock()
    mock_db.maintenance_programs_v2.update_one = AsyncMock()

    dispatch = AsyncMock()

    with patch("services.maintenance_scheduling.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync",
        dispatch,
    ):
        from services.maintenance_scheduling import schedule_program

        created = await schedule_program(program, horizon_days=60)

    assert len(created) == 3
    assert dispatch.await_count == 3
