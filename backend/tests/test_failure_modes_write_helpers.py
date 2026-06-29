"""Tests for failure mode write helpers."""
from services.failure_modes_write import format_recommended_actions_text


def test_format_recommended_actions_text_handles_objects():
    actions = [
        {"description": "Replace seal", "discipline": "mechanical"},
        {"action": "Inspect bearings", "action_type": "PM"},
    ]
    assert format_recommended_actions_text(actions) == "Replace seal, Inspect bearings"


def test_format_recommended_actions_text_handles_strings():
    assert format_recommended_actions_text(["Check oil", "Replace filter"]) == "Check oil, Replace filter"
