"""Tests for duplicate recommended action similarity."""
from services.failure_modes.action_duplicate_similarity import (
    actions_similar_for_duplicates,
    duplicate_action_jaccard,
)
from services.failure_modes.actions_sync import FailureModesMixin


BEARING_ACTIONS = [
    {"description": "Check lubrication", "action_type": "PM", "discipline": "rotating"},
    {"description": "Listen for bearing noise", "action_type": "PDM", "discipline": "rotating"},
    {"description": "Replace worn bearings", "action_type": "CM", "discipline": "rotating"},
    {"description": "Monitor vibration levels", "action_type": "PDM", "discipline": "mechanical"},
    {"description": "Proper lubrication", "action_type": "PM", "discipline": "mechanical"},
    {"description": "Replace bearing on failure", "action_type": "CM", "discipline": "mechanical"},
]


def test_duplicate_jaccard_catches_lubrication_pair():
    a = FailureModesMixin._normalize_action_text(BEARING_ACTIONS[0])
    b = FailureModesMixin._normalize_action_text(BEARING_ACTIONS[4])
    assert duplicate_action_jaccard(a, b) >= 0.4


def test_duplicate_jaccard_catches_replace_pair():
    a = FailureModesMixin._normalize_action_text(BEARING_ACTIONS[2])
    b = FailureModesMixin._normalize_action_text(BEARING_ACTIONS[5])
    assert duplicate_action_jaccard(a, b) >= 0.4


def test_loose_similarity_finds_bearing_failure_duplicates():
    assert FailureModesMixin._actions_similar_pair(
        BEARING_ACTIONS[0],
        BEARING_ACTIONS[4],
        0.75,
        0.48,
        strict_pairing=False,
    )
    assert FailureModesMixin._actions_similar_pair(
        BEARING_ACTIONS[2],
        BEARING_ACTIONS[5],
        0.75,
        0.48,
        strict_pairing=False,
    )


def test_loose_clustering_groups_bearing_failure_duplicates():
    clusters = FailureModesMixin._cluster_duplicate_action_indices(
        BEARING_ACTIONS,
        strict_pairing=False,
    )
    flat = {i for cluster in clusters for i in cluster}
    assert {0, 4}.issubset(flat)
    assert {2, 5}.issubset(flat)


def test_monitoring_pair_not_treated_as_duplicate():
    a = FailureModesMixin._normalize_action_text(BEARING_ACTIONS[1])
    b = FailureModesMixin._normalize_action_text(BEARING_ACTIONS[3])
    assert not actions_similar_for_duplicates(
        a,
        b,
        general_jaccard=0.0,
        ratio_threshold=0.75,
        jaccard_threshold=0.48,
        strict_pairing=False,
    )
