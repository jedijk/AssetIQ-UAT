"""Unit tests for AI action consolidation helpers."""
from services.failure_modes.actions_sync import FailureModesMixin


class _Harness(FailureModesMixin):
    pass


def test_clamp_consolidation_targets():
    lo, hi = _Harness._clamp_consolidation_targets(3, 5)
    assert lo == 3
    assert hi == 5

    lo, hi = _Harness._clamp_consolidation_targets(1, 10)
    assert lo >= 2
    assert hi <= 8
    assert lo <= hi


def test_build_consolidated_action_objects_merges_metadata():
    actions = [
        {"description": "Inspect bearings", "action_type": "PM", "discipline": "rotating"},
        {"description": "Check bearing wear", "action_type": "PM", "discipline": "rotating", "estimated_minutes": 30},
        {"description": "Replace seal", "action_type": "CM", "discipline": "static"},
    ]
    ai_items = [
        {
            "description": "Inspect and assess bearing condition",
            "action_type": "PM",
            "discipline": "rotating",
            "merged_from_indices": [0, 1],
            "rationale": "Same bearing inspection scope",
        },
        {
            "description": "Replace mechanical seal",
            "action_type": "CM",
            "discipline": "static",
            "merged_from_indices": [2],
        },
    ]
    out = _Harness()._build_consolidated_action_objects(actions, ai_items)
    assert len(out) == 2
    assert out[0]["description"] == "Inspect and assess bearing condition"
    assert out[0]["estimated_minutes"] == 30
    assert out[0]["merged_from_indices"] == [0, 1]
    assert out[1]["description"] == "Replace mechanical seal"
