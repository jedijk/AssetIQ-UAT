"""Tests for observation auto-mitigation helpers."""
from services.observation_mitigation import (
    is_action_plan_item_done,
    observation_action_filter,
)


def test_is_action_plan_item_done():
    assert is_action_plan_item_done("completed") is True
    assert is_action_plan_item_done("Validated") is True
    assert is_action_plan_item_done("open") is False
    assert is_action_plan_item_done("in_progress") is False
    assert is_action_plan_item_done(None) is False


def test_observation_action_filter_matches_workspace_links():
    obs_id = "obs-123"
    filt = observation_action_filter(obs_id)
    assert filt == {
        "$or": [
            {"source_id": obs_id},
            {"observation_id": obs_id},
            {"threat_id": obs_id},
        ]
    }
