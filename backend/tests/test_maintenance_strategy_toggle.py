"""Fast-path detection for maintenance strategy enable/mandatory toggles."""
from types import SimpleNamespace

from services.maintenance_strategy_propagation import (
    is_enable_only_fm_toggle,
    is_mandatory_only_task_toggle,
)


def test_is_enable_only_fm_toggle():
    req = SimpleNamespace(
        enabled=False,
        strategy_type=None,
        detection_methods=None,
        task_ids=None,
        frequency_override=None,
    )
    assert is_enable_only_fm_toggle(req) is True

    req.strategy_type = "preventive"
    assert is_enable_only_fm_toggle(req) is False


def test_is_mandatory_only_task_toggle():
    assert is_mandatory_only_task_toggle({"is_mandatory": False}) is True
    assert is_mandatory_only_task_toggle({"is_mandatory": True, "name": "x"}) is False
