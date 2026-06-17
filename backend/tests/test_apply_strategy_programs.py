"""Apply strategy — v2 program creation reporting."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from models.maintenance_scheduler import ApplyStrategyRequest
from services.apply_strategy_service import apply_strategy_to_equipment as _apply_strategy_to_equipment_impl


@pytest.mark.asyncio
async def test_schedule_program_coerces_integer_failure_mode_id():
    """Library failure modes use numeric ids (e.g. bearing_radial FM 532)."""
    program = {
        "id": "task-1",
        "equipment_id": "eq-bearing",
        "equipment_name": "Radial Bearing",
        "task_name": "Vibration analysis",
        "task_type": "predictive",
        "frequency_days": 30,
        "criticality": "medium",
        "strategy_id": "bearing_radial",
        "strategy_version": "1.0",
        "failure_mode_id": 532,
        "failure_mode_name": "Bearing Seizure",
        "program_source": "v2",
        "v2_task_id": "task-1",
        "is_active": True,
    }

    mock_db = MagicMock()
    mock_db.scheduled_tasks.find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )
    mock_db.scheduled_tasks.insert_many = AsyncMock()

    with patch("services.maintenance_scheduling.db", mock_db), patch(
        "services.reliability_graph.dispatch_graph_sync",
        AsyncMock(),
    ):
        from services.maintenance_scheduling import schedule_program

        created = await schedule_program(program, horizon_days=30)

    assert created
    inserted = mock_db.scheduled_tasks.insert_many.call_args[0][0]
    assert inserted[0]["failure_mode_id"] == "532"


@pytest.mark.asyncio
async def test_generate_tasks_from_strategy_coerces_integer_failure_mode_id():
    strategy = {
        "equipment_type_id": "bearing_radial",
        "version": "1.0",
        "task_templates": [
            {
                "id": "tpl-vib",
                "name": "Vibration analysis",
                "task_type": "predictive",
                "frequency_matrix": {"low": "quarterly", "medium": "monthly", "high": "weekly"},
                "failure_mode_ids": [532],
            }
        ],
        "failure_mode_strategies": [
            {
                "failure_mode_id": 532,
                "failure_mode_name": "Bearing Seizure",
                "task_ids": ["tpl-vib"],
                "enabled": True,
            }
        ],
    }

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=strategy)

    with patch("services.maintenance_program_service.db", mock_db):
        from services.maintenance_program_service import MaintenanceProgramService

        tasks = await MaintenanceProgramService.generate_tasks_from_strategy(
            equipment_type_id="bearing_radial",
            equipment_id="eq-bearing",
            criticality_level="medium",
        )

    assert len(tasks) == 1
    assert tasks[0].traceability.failure_mode_id == "532"


@pytest.mark.asyncio
async def test_apply_strategy_reports_v2_programs_created_when_legacy_sync_off():
    equipment_type_id = "et-1"
    equipment_id = "eq-1"
    request = ApplyStrategyRequest(equipment_ids=[equipment_id], run_async=False)
    current_user = {"id": "user-1", "company_id": "co-1"}

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(
        return_value={
            "equipment_type_id": equipment_type_id,
            "status": "active",
            "version": "2.0",
            "task_templates": [{"id": "tpl-1", "name": "Inspect", "task_type": "preventive"}],
            "failure_mode_strategies": [],
        }
    )
    mock_db.equipment_nodes.find = MagicMock(
        side_effect=[
            MagicMock(
                to_list=AsyncMock(
                    return_value=[{"id": equipment_id, "name": "Pump", "tag": "P-1"}]
                )
            ),
            MagicMock(to_list=AsyncMock(return_value=[{"id": equipment_id}])),
        ]
    )
    mock_db.scheduled_tasks.delete_many = AsyncMock(return_value=MagicMock(deleted_count=0))
    mock_db.maintenance_programs.delete_many = AsyncMock(return_value=MagicMock(deleted_count=0))
    mock_db.maintenance_programs_v2.delete_many = AsyncMock(return_value=MagicMock(deleted_count=0))

    v2_sync = {
        "programs_created": 1,
        "programs_regenerated": 0,
        "equipment_ids_created": [equipment_id],
        "equipment_ids_regenerated": [],
        "errors": [],
    }

    with patch("services.apply_strategy_service.db", mock_db), patch(
        "services.maintenance_program_service.MaintenanceProgramService.ensure_programs_for_equipment_ids",
        AsyncMock(return_value=v2_sync),
    ), patch(
        "services.strategy_propagation.resync_programs_with_strategy",
        AsyncMock(return_value={"programs_deactivated": 0}),
    ), patch(
        "services.apply_strategy_service.refresh_equipment_schedule",
        AsyncMock(return_value={"strategy_programs_created": 0}),
    ), patch(
        "services.maintenance_scheduling.schedule_programs_for_equipment",
        AsyncMock(return_value=0),
    ), patch(
        "services.strategy_apply_state.clear_strategy_needs_apply",
        AsyncMock(),
    ), patch(
        "services.reliability_graph.sync_edges_for_apply_strategy",
        AsyncMock(return_value={"edges_upserted": 1}),
    ), patch(
        "services.scheduler_helpers.build_task_to_failure_modes",
        return_value={},
    ), patch(
        "services.scheduler_helpers.is_strategy_task_active",
        return_value=True,
    ):
        result = await _apply_strategy_to_equipment_impl(
            equipment_type_id, request, current_user
        )

    assert result["equipment_manager_programs_created"] == 1
    assert result["programs_created"] == 1
    assert result["equipment_manager_program_errors"] == []
