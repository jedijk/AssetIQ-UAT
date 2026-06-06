"""Phase 5: v2-only scheduler path and legacy sync gating."""
import asyncio

from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.program_task_resolution import _dedupe


def test_legacy_sync_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    assert should_sync_legacy_maintenance_programs() is False


def test_legacy_sync_opt_in(monkeypatch):
    monkeypatch.setenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", "true")
    assert should_sync_legacy_maintenance_programs() is True

    monkeypatch.setenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", "1")
    assert should_sync_legacy_maintenance_programs() is True


def test_dedupe_program_ids():
    assert _dedupe(["a", "b", "a", "", "c", "b"]) == ["a", "b", "c"]


def test_sync_strategy_skips_legacy_when_disabled(monkeypatch):
    monkeypatch.delenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", raising=False)

    from services.maintenance_scheduler_sync import sync_strategy_programs_for_equipment

    result = asyncio.run(
        sync_strategy_programs_for_equipment(
            {"id": "eq-1"},
            {"equipment_type_id": "et-1", "task_templates": [{"id": "t1", "name": "Test"}]},
        )
    )
    assert result == (0, 0, 0)
