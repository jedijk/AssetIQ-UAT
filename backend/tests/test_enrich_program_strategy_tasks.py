"""GET maintenance program — ephemeral strategy task enrichment."""
import os
import sys
import types

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Break circular import: routes/__init__ loads maintenance_program which imports this service.
if "routes.maintenance_program" not in sys.modules:
    _mock_mp = types.ModuleType("routes.maintenance_program")
    _mock_mp.router = MagicMock()
    sys.modules["routes.maintenance_program"] = _mock_mp

from services.maintenance_program_service import MaintenanceProgramService


MOCK_STRATEGY = {
    "equipment_type_id": "et-1",
    "version": "1.0",
    "task_templates": [
        {
            "id": "tpl-1",
            "name": "Inspect bearings",
            "description": "Visual inspection",
            "task_type": "preventive",
            "frequency_matrix": {"low": "monthly", "medium": "monthly", "high": "weekly"},
            "duration_hours": 1.0,
        },
        {
            "id": "tpl-2",
            "name": "Lubricate shaft",
            "description": "Apply grease",
            "task_type": "preventive",
            "frequency_matrix": {"low": "quarterly", "medium": "monthly", "high": "monthly"},
            "duration_hours": 0.5,
        },
    ],
    "failure_mode_strategies": [],
}


def _mock_db(strategy=None, equipment=None):
    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=strategy)
    mock_db.equipment_nodes.find_one = AsyncMock(return_value=equipment)
    return mock_db


def _patch_maintenance_program_db(mock_db):
    """Patch db on service, enrichment, and equipment loader modules."""
    return (
        patch("services.maintenance_program_service.db", mock_db),
        patch("services.maintenance_program_enrichment.db", mock_db),
        patch("services.maintenance_program_helpers.db", mock_db),
    )


@pytest.mark.asyncio
async def test_enrich_adds_strategy_tasks_to_ephemeral_pm_only_program():
    equipment_id = "eq-1"
    program = {
        "id": f"ephemeral-{equipment_id}",
        "equipment_id": equipment_id,
        "equipment_type_id": "et-1",
        "tasks": [
            {
                "id": "pm-1",
                "task_title": "Imported PM Task",
                "task_source": "customer_imported",
                "frequency": "monthly",
                "is_active": True,
            }
        ],
        "strategy_tasks": 0,
    }
    mock_db = _mock_db(
        strategy=MOCK_STRATEGY,
        equipment={"id": equipment_id, "equipment_type_id": "et-1", "criticality": {"level": "medium"}},
    )

    db_patch_service, db_patch_enrichment, db_patch_helpers = _patch_maintenance_program_db(mock_db)
    with db_patch_service, db_patch_enrichment, db_patch_helpers, patch(
        "services.scheduler_helpers.build_task_to_failure_modes",
        return_value={},
    ), patch(
        "services.scheduler_helpers.is_strategy_task_active",
        return_value=True,
    ):
        result, added = await MaintenanceProgramService.enrich_program_response_with_strategy_tasks(
            program,
            equipment_id,
            user_id="user-1",
        )

    assert added == 2
    assert result["strategy_tasks"] == 2
    strategy_tasks = [t for t in result["tasks"] if t.get("task_source") == "strategy_generated"]
    assert len(strategy_tasks) == 2
    template_ids = {(t.get("traceability") or {}).get("task_template_id") for t in strategy_tasks}
    assert template_ids == {"tpl-1", "tpl-2"}
    assert any(t.get("task_title") == "Inspect bearings" for t in strategy_tasks)


@pytest.mark.asyncio
async def test_enrich_adds_strategy_tasks_when_stored_program_has_none():
    equipment_id = "eq-2"
    program = {
        "id": "prog-2",
        "equipment_id": equipment_id,
        "equipment_type_id": "et-1",
        "tasks": [
            {
                "id": "manual-1",
                "task_title": "Manual check",
                "task_source": "manual",
                "frequency": "monthly",
                "is_active": True,
            }
        ],
        "strategy_tasks": 0,
    }
    mock_db = _mock_db(
        strategy=MOCK_STRATEGY,
        equipment={"id": equipment_id, "equipment_type_id": "et-1", "criticality": "low"},
    )

    db_patch_service, db_patch_enrichment, db_patch_helpers = _patch_maintenance_program_db(mock_db)
    with db_patch_service, db_patch_enrichment, db_patch_helpers, patch(
        "services.scheduler_helpers.build_task_to_failure_modes",
        return_value={},
    ), patch(
        "services.scheduler_helpers.is_strategy_task_active",
        return_value=True,
    ):
        result, added = await MaintenanceProgramService.enrich_program_response_with_strategy_tasks(
            program,
            equipment_id,
            user_id="user-1",
        )

    assert added == 2
    assert result["total_tasks"] == 3
    assert result["strategy_tasks"] == 2
    assert result["manual_tasks"] == 1


@pytest.mark.asyncio
async def test_enrich_dedupes_existing_strategy_template_ids():
    equipment_id = "eq-3"
    program = {
        "id": "prog-3",
        "equipment_id": equipment_id,
        "equipment_type_id": "et-1",
        "tasks": [
            {
                "id": "strat-1",
                "task_title": "Inspect bearings",
                "task_source": "strategy_generated",
                "traceability": {"task_template_id": "tpl-1"},
                "frequency": "monthly",
                "is_active": True,
            }
        ],
        "strategy_tasks": 1,
    }
    mock_db = _mock_db(strategy=MOCK_STRATEGY, equipment=None)
    mock_db.equipment_nodes.find_one = AsyncMock(
        return_value={"id": equipment_id, "equipment_type_id": "et-1", "criticality": {"level": "medium"}}
    )

    db_patch_service, db_patch_enrichment, db_patch_helpers = _patch_maintenance_program_db(mock_db)
    with db_patch_service, db_patch_enrichment, db_patch_helpers, patch(
        "services.scheduler_helpers.build_task_to_failure_modes",
        return_value={},
    ), patch(
        "services.scheduler_helpers.is_strategy_task_active",
        return_value=True,
    ):
        result, added = await MaintenanceProgramService.enrich_program_response_with_strategy_tasks(
            program,
            equipment_id,
            user_id="user-1",
        )

    assert added == 1
    assert result["strategy_tasks"] == 2
    template_ids = [
        (t.get("traceability") or {}).get("task_template_id")
        for t in result["tasks"]
        if t.get("task_source") == "strategy_generated"
    ]
    assert sorted(template_ids) == ["tpl-1", "tpl-2"]
