"""Ensure v2 program sync stamps tenant_id and backfills legacy rows."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import services.tenant_schema as tenant_schema
from services.maintenance_program_service import MaintenanceProgramService


@pytest.mark.asyncio
async def test_ensure_program_backfills_legacy_row_in_strict_mode(monkeypatch):
    """Legacy programs without tenant_id must be updated under TENANT_STRICT_MODE."""
    monkeypatch.setattr(tenant_schema, "TENANT_STRICT_MODE", True)

    equipment_id = "eq-legacy"
    tenant_id = "co-1"
    equipment = {
        "id": equipment_id,
        "name": "Pump A",
        "tag": "P-1",
        "tenant_id": tenant_id,
        "equipment_type_id": "pump_centrifugal",
    }

    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(return_value=equipment)
    mock_db.maintenance_programs_v2.find_one = AsyncMock(
        side_effect=[
            None,
            {"equipment_id": equipment_id},
        ]
    )
    mock_db.maintenance_programs_v2.update_one = AsyncMock(
        side_effect=[
            MagicMock(matched_count=0),
            MagicMock(matched_count=1),
        ]
    )

    with patch("services.maintenance_program_service.db", mock_db), patch(
        "services.maintenance_program_helpers.db",
        mock_db,
    ), patch.object(
        MaintenanceProgramService,
        "regenerate_program",
        AsyncMock(return_value=(MagicMock(), MagicMock())),
    ):
        result = await MaintenanceProgramService.ensure_equipment_program_from_strategy(
            equipment_id=equipment_id,
            strategy_version="2.0",
            user_id="user-1",
            tenant_id=tenant_id,
        )

    assert result["action"] == "regenerated"
    legacy_update = mock_db.maintenance_programs_v2.update_one.call_args_list[-1]
    assert legacy_update[0][0] == {"equipment_id": equipment_id}
    assert legacy_update[0][1]["$set"]["tenant_id"] == tenant_id
    assert legacy_update[0][1]["$set"]["status"] == "active"


@pytest.mark.asyncio
async def test_get_or_create_program_stamps_tenant_id_on_insert():
    equipment_id = "eq-new"
    tenant_id = "co-1"
    equipment = {
        "id": equipment_id,
        "name": "Motor",
        "tenant_id": tenant_id,
        "equipment_type_id": "motor_electric",
    }

    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(return_value=equipment)
    mock_db.maintenance_programs_v2.find_one = AsyncMock(return_value=None)
    mock_db.equipment_type_strategies.find_one = AsyncMock(return_value=None)
    mock_db.maintenance_programs_v2.insert_one = AsyncMock()
    mock_db.maintenance_program_audit.insert_one = AsyncMock()

    with patch("services.maintenance_program_service.db", mock_db), patch(
        "services.maintenance_program_helpers.db",
        mock_db,
    ):
        await MaintenanceProgramService.get_or_create_program(
            equipment_id=equipment_id,
            generate_from_strategy=False,
            tenant_id=tenant_id,
        )

    inserted = mock_db.maintenance_programs_v2.insert_one.call_args[0][0]
    assert inserted["tenant_id"] == tenant_id
