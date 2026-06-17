"""Tests for PM import per-task enable/disable."""
from services.pm_import_constants import is_pm_import_task_active


def test_pm_import_task_active_defaults_true():
    assert is_pm_import_task_active({}) is True
    assert is_pm_import_task_active({"is_active": True}) is True


def test_pm_import_task_inactive():
    assert is_pm_import_task_active({"is_active": False}) is False
