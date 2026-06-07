"""Tests for PM import discipline backfill."""

from services.normalize_pm_import_disciplines import _canonical_discipline, _is_pm_import_program_task


def test_canonical_discipline_mechanical_to_rotating():
    canonical, changed = _canonical_discipline("Mechanical")
    assert changed is True
    assert canonical == "rotating"


def test_canonical_discipline_already_standard():
    canonical, changed = _canonical_discipline("rotating")
    assert changed is False
    assert canonical == "rotating"


def test_is_pm_import_program_task():
    assert _is_pm_import_program_task({"task_source": "customer_imported"}) is True
    assert _is_pm_import_program_task({"id": "pm-import:abc:1"}) is True
    assert _is_pm_import_program_task(
        {"traceability": {"pm_import_task_id": "sess:1"}}
    ) is True
    assert _is_pm_import_program_task({"task_source": "strategy_generated"}) is False
