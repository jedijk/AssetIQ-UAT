"""Unit tests for shared scheduler/strategy active-task helpers."""
from services.scheduler_helpers import (
    build_task_to_failure_modes,
    is_strategy_task_active,
    program_is_schedulable,
)


def test_standalone_mandatory_task_is_active():
    task = {"id": "t1", "is_mandatory": True, "task_type": "preventive"}
    assert is_strategy_task_active(task) is True


def test_mandatory_false_is_inactive():
    task = {"id": "t1", "is_mandatory": False, "task_type": "preventive"}
    assert is_strategy_task_active(task) is False


def test_reactive_task_is_inactive():
    task = {"id": "t1", "is_mandatory": True, "task_type": "reactive"}
    assert is_strategy_task_active(task) is False


def test_fm_linked_task_inactive_when_all_fms_disabled():
    strategy = {
        "failure_mode_strategies": [
            {"failure_mode_id": "fm1", "enabled": False, "task_ids": ["t1"]},
        ]
    }
    task_to_fms = build_task_to_failure_modes(strategy)
    task = {"id": "t1", "is_mandatory": True, "task_type": "preventive"}
    assert is_strategy_task_active(task, task_to_fms=task_to_fms) is False


def test_fm_linked_task_active_when_one_fm_enabled():
    strategy = {
        "failure_mode_strategies": [
            {"failure_mode_id": "fm1", "enabled": False, "task_ids": ["t1"]},
            {"failure_mode_id": "fm2", "enabled": True, "task_ids": ["t1"]},
        ]
    }
    task_to_fms = build_task_to_failure_modes(strategy)
    task = {"id": "t1", "is_mandatory": True, "task_type": "preventive"}
    assert is_strategy_task_active(task, task_to_fms=task_to_fms) is True


def test_fm_linked_via_failure_mode_ids_is_inactive_when_fm_disabled():
    strategy = {
        "failure_mode_strategies": [
            {
                "failure_mode_id": "fm1",
                "enabled": False,
                "task_ids": [],
            },
        ],
        "task_templates": [
            {
                "id": "t1",
                "is_mandatory": True,
                "task_type": "preventive",
                "failure_mode_ids": ["fm1"],
            },
        ],
    }
    task_to_fms = build_task_to_failure_modes(strategy)
    task = strategy["task_templates"][0]
    assert "t1" in task_to_fms
    assert is_strategy_task_active(task, task_to_fms=task_to_fms) is False


def test_program_is_schedulable_requires_active_flag():
    assert program_is_schedulable(
        {"task_source": "strategy_generated", "strategy_id": "et1", "is_active": False},
        {"et1"},
    ) is False
