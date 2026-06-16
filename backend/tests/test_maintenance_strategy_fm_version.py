"""Unit tests for maintenance strategy failure-mode version enrichment."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.maintenance_strategy_helpers import (
    coerce_fm_library_version,
    refresh_failure_mode_strategy_from_library,
    strip_fm_enrichment_fields,
    fm_strategy_row_matches_id,
    library_fm_matches_strategy_row,
)


def test_coerce_fm_library_version_handles_strings_and_invalid():
    assert coerce_fm_library_version(3) == 3
    assert coerce_fm_library_version("4") == 4
    assert coerce_fm_library_version(None) == 1
    assert coerce_fm_library_version("bad") == 1


def test_strip_fm_enrichment_fields_removes_response_only_keys():
    fm = {
        "failure_mode_id": "fm-1",
        "fm_version": 2,
        "library_version": 3,
        "library_updated_at": "2026-01-01",
        "has_new_version": True,
    }
    cleaned = strip_fm_enrichment_fields(fm)
    assert cleaned["fm_version"] == 2
    assert "library_version" not in cleaned
    assert "has_new_version" not in cleaned


def test_refresh_failure_mode_strategy_updates_fm_version():
    library_fm = {
        "id": "fm-1",
        "version": 3,
        "failure_mode": "Seal leak",
        "severity": 8,
        "occurrence": 5,
        "detectability": 4,
        "potential_effects": ["production loss"],
    }
    fm_strategy = {
        "failure_mode_id": "fm-1",
        "failure_mode_name": "Seal leak",
        "fm_version": 2,
        "strategy_type": "preventive",
        "task_ids": [],
        "detection_methods": ["visual"],
    }
    tasks = []
    updated_fm, _, _ = refresh_failure_mode_strategy_from_library(
        library_fm, fm_strategy, tasks
    )
    assert updated_fm["fm_version"] == 3


def test_fm_strategy_row_matches_legacy_int_id():
    fm = {"failure_mode_id": 42, "failure_mode_name": "Seal leak"}
    assert fm_strategy_row_matches_id(fm, "42")
    assert fm_strategy_row_matches_id(fm, 42)


def test_library_fm_matches_strategy_row_by_name_or_id():
    library_fm = {"id": "fm-1", "failure_mode": "Seal leak", "version": 2}
    strategy_fm = {"failure_mode_id": "fm-1", "failure_mode_name": "Seal leak", "fm_version": 1}
    assert library_fm_matches_strategy_row(library_fm, strategy_fm)


@pytest.mark.asyncio
async def test_sync_failure_mode_from_library_updates_version():
    from services import maintenance_strategy_v2_service as svc

    existing_fm = {
        "failure_mode_id": "fm-1",
        "failure_mode_name": "Seal leak",
        "fm_version": 2,
        "task_ids": [],
        "strategy_type": "preventive",
        "detection_methods": ["visual"],
    }
    strategy = {
        "equipment_type_id": "et-1",
        "version": "1.0",
        "failure_mode_strategies": [existing_fm],
        "task_templates": [],
    }
    library_fm = {
        "id": "fm-1",
        "failure_mode": "Seal leak",
        "version": 3,
        "severity": 8,
        "occurrence": 5,
        "detectability": 4,
    }

    find_one = AsyncMock(return_value=strategy)
    update_one = AsyncMock()

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = find_one
    mock_db.equipment_type_strategies.update_one = update_one

    with patch("services.maintenance_strategy_v2_service.db", mock_db), patch(
        "services.maintenance_strategy_v2_service.lookup_library_failure_mode",
        AsyncMock(return_value=library_fm),
    ), patch(
        "services.maintenance_strategy_v2_service._bump_strategy_version",
        AsyncMock(return_value="1.1"),
    ), patch(
        "services.maintenance_strategy_v2_service._refresh_applied_equipment_timeline",
        AsyncMock(return_value={}),
    ):
        result = await svc.sync_failure_mode_from_library("et-1", "fm-1", {"user_id": "u1"})

    assert result["updated"] is True
    assert result["fm_version"] == 3
    assert existing_fm["fm_version"] == 3
    update_one.assert_called_once()
    persisted = update_one.call_args[0][1]["$set"]["failure_mode_strategies"][0]
    assert persisted["fm_version"] == 3
    assert "has_new_version" not in persisted


@pytest.mark.asyncio
async def test_get_strategy_effects_backfill_reloads_before_persist():
    """GET enrichment must not overwrite a newer fm_version from a concurrent sync."""
    from services import maintenance_strategy_v2_service as svc

    stale_strategy = {
        "equipment_type_id": "et-1",
        "version": "1.0",
        "active_failure_modes": 1,
        "failure_mode_strategies": [
            {
                "failure_mode_id": "fm-1",
                "failure_mode_name": "Seal leak",
                "fm_version": 2,
                "enabled": True,
            }
        ],
    }
    fresh_strategy = {
        "failure_mode_strategies": [
            {
                "failure_mode_id": "fm-1",
                "failure_mode_name": "Seal leak",
                "fm_version": 3,
                "enabled": True,
            }
        ],
    }
    library_fm = {
        "id": "fm-1",
        "failure_mode": "Seal leak",
        "version": 3,
        "potential_effects": ["production loss"],
    }

    find_one = AsyncMock(side_effect=[stale_strategy, fresh_strategy])
    update_one = AsyncMock()
    count_documents = AsyncMock(return_value=0)
    programs_find = MagicMock()
    programs_find.to_list = AsyncMock(return_value=[])

    mock_db = MagicMock()
    mock_db.equipment_type_strategies.find_one = find_one
    mock_db.equipment_type_strategies.update_one = update_one
    mock_db.equipment_nodes.count_documents = count_documents
    mock_db.maintenance_programs_v2.find = MagicMock(return_value=programs_find)

    with patch("services.maintenance_strategy_v2_service.db", mock_db), patch(
        "services.maintenance_strategy_v2_service.lookup_library_failure_mode",
        AsyncMock(return_value=library_fm),
    ), patch(
        "services.maintenance_strategy_v2_service.enrich_strategy_needs_apply",
        AsyncMock(return_value=False),
    ):
        result = await svc.get_equipment_type_strategy("et-1", {"user_id": "u1"})

    fm = result["strategy"]["failure_mode_strategies"][0]
    assert fm["has_new_version"] is True  # stale in-memory snapshot; DB backfill preserves sync

    update_one.assert_called_once()
    persisted_fms = update_one.call_args[0][1]["$set"]["failure_mode_strategies"]
    assert persisted_fms[0]["fm_version"] == 3
    assert persisted_fms[0]["potential_effects"] == ["production loss"]
    assert "has_new_version" not in persisted_fms[0]
