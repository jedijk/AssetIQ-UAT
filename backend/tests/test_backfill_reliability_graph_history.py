"""Tests for reliability graph history backfill script."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts.backfill_reliability_graph_history import (  # noqa: E402
    BackfillConfig,
    config_from_args,
    parse_args,
    scheduled_task_event,
    should_run_phase,
    backfill_scheduled_tasks,
    backfill_maintenance_programs,
    run_backfill,
)


def test_parse_args_defaults():
    args = parse_args([])
    assert args.dry_run is False
    assert args.phase == "all"
    assert args.equipment_id is None
    assert args.batch_size == 100
    assert args.limit is None


def test_parse_args_custom_flags():
    args = parse_args(
        [
            "--dry-run",
            "--phase",
            "maintenance",
            "--equipment-id",
            "eq-1",
            "--batch-size",
            "25",
            "--limit",
            "10",
        ]
    )
    config = config_from_args(args)
    assert config.dry_run is True
    assert config.phase == "maintenance"
    assert config.equipment_id == "eq-1"
    assert config.batch_size == 25
    assert config.limit == 10


def test_should_run_phase():
    all_config = BackfillConfig(phase="all")
    maint_config = BackfillConfig(phase="maintenance")
    reactive_config = BackfillConfig(phase="reactive")

    assert should_run_phase(all_config, "maintenance")
    assert should_run_phase(all_config, "reactive")
    assert should_run_phase(maint_config, "maintenance")
    assert not should_run_phase(maint_config, "reactive")
    assert should_run_phase(reactive_config, "reactive")
    assert not should_run_phase(reactive_config, "maintenance")


@pytest.mark.parametrize(
    "status,expected",
    [
        ("pending", "created"),
        ("scheduled", "created"),
        ("in_progress", "created"),
        ("completed", "completed"),
        ("cancelled", "cancelled"),
        (None, "created"),
    ],
)
def test_scheduled_task_event(status, expected):
    assert scheduled_task_event(status) == expected


@pytest.mark.asyncio
async def test_backfill_scheduled_tasks_dry_run():
    mock_db = MagicMock()
    tasks = [
        {"id": "st-1", "status": "scheduled", "equipment_id": "eq-1"},
        {"id": "st-2", "status": "completed", "equipment_id": "eq-1"},
    ]

    async def _aiter():
        for task in tasks:
            yield task

    class _Cursor:
        def batch_size(self, _n):
            return self

        def limit(self, _n):
            return self

        def __aiter__(self):
            return _aiter()

    mock_db.scheduled_tasks.find = MagicMock(return_value=_Cursor())
    config = BackfillConfig(dry_run=True, limit=10)

    stats = await backfill_scheduled_tasks(mock_db, config)

    assert stats.synced == 2
    assert stats.errors == 0


@pytest.mark.asyncio
async def test_backfill_scheduled_tasks_calls_sync():
    mock_db = MagicMock()
    task = {"id": "st-1", "status": "completed", "equipment_id": "eq-1", "tenant_id": "co-1"}

    async def _aiter():
        yield task

    class _Cursor:
        def batch_size(self, _n):
            return self

        def limit(self, _n):
            return self

        def __aiter__(self):
            return _aiter()

    mock_db.scheduled_tasks.find = MagicMock(return_value=_Cursor())
    config = BackfillConfig(dry_run=False)

    mock_sync = AsyncMock()
    with patch(
        "services.reliability_graph.sync_edges_for_scheduled_task",
        mock_sync,
    ):
        stats = await backfill_scheduled_tasks(mock_db, config)

    assert stats.synced == 1
    mock_sync.assert_awaited_once()
    assert mock_sync.await_args.kwargs["event"] == "completed"
    assert mock_sync.await_args.kwargs["tenant_id"] == "co-1"


@pytest.mark.asyncio
async def test_backfill_maintenance_programs_groups_by_type():
    mock_db = MagicMock()
    programs = [
        {
            "equipment_id": "eq-1",
            "source_strategy_version": "2.0",
            "tenant_id": "co-1",
        },
        {
            "equipment_id": "eq-2",
            "source_strategy_version": "2.0",
            "tenant_id": "co-1",
        },
    ]

    async def _prog_iter():
        for program in programs:
            yield program

    class _Cursor:
        def batch_size(self, _n):
            return self

        def limit(self, _n):
            return self

        def __aiter__(self):
            return _prog_iter()

    mock_db.maintenance_programs_v2.find = MagicMock(return_value=_Cursor())
    equipment_cache = {
        "eq-1": {"equipment_type_id": "et-1", "tenant_id": "co-1"},
        "eq-2": {"equipment_type_id": "et-1", "tenant_id": "co-1"},
    }
    config = BackfillConfig(dry_run=False)

    mock_apply = AsyncMock(return_value={"edges_upserted": 5, "edges_retired": 0})
    with patch(
        "services.reliability_graph.sync_edges_for_apply_strategy",
        mock_apply,
    ):
        stats = await backfill_maintenance_programs(mock_db, config, equipment_cache)

    assert stats.synced == 2
    mock_apply.assert_awaited_once()
    assert mock_apply.await_args.kwargs["equipment_type_id"] == "et-1"
    assert sorted(mock_apply.await_args.kwargs["equipment_ids"]) == ["eq-1", "eq-2"]
    assert mock_apply.await_args.kwargs["strategy_version"] == "2.0"


@pytest.mark.asyncio
async def test_run_backfill_phase_maintenance_only():
    mock_db = MagicMock()
    config = BackfillConfig(phase="maintenance", dry_run=True)

    empty_stats = MagicMock(scanned=0, synced=0, skipped=0, errors=0, error_samples=[])

    with patch(
        "scripts.backfill_reliability_graph_history._load_equipment_cache",
        AsyncMock(return_value={}),
    ), patch(
        "scripts.backfill_reliability_graph_history.backfill_maintenance_programs",
        AsyncMock(return_value=empty_stats),
    ) as mock_programs, patch(
        "scripts.backfill_reliability_graph_history.backfill_scheduled_tasks",
        AsyncMock(return_value=empty_stats),
    ) as mock_scheduled, patch(
        "scripts.backfill_reliability_graph_history.backfill_task_instances",
        AsyncMock(return_value=empty_stats),
    ) as mock_instances, patch(
        "scripts.backfill_reliability_graph_history.backfill_observations",
        AsyncMock(return_value=empty_stats),
    ) as mock_obs:
        await run_backfill(mock_db, config)

    mock_programs.assert_awaited_once()
    mock_scheduled.assert_awaited_once()
    mock_instances.assert_awaited_once()
    mock_obs.assert_not_called()
