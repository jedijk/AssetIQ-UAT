"""Regression tests for chat full-match auto-selection."""
from chat_handler_v2 import find_full_equipment_match


def test_no_match_returns_none():
    assert find_full_equipment_match("random broken thing", []) is None
    assert find_full_equipment_match(
        "random broken thing",
        [{"name": "Conveyor Belt", "tag": "CB-01"}],
    ) is None


def test_exact_name_single_match():
    cands = [
        {"id": "1", "name": "Pump A", "tag": "P-001"},
        {"id": "2", "name": "Pump B", "tag": "P-002"},
    ]
    # User typed exact phrase "Pump A" — must select "Pump A" even though both match the word "pump"
    result = find_full_equipment_match("Reporting issue for Pump A leaking oil", cands)
    assert result is not None
    assert result["id"] == "1"


def test_exact_tag_match():
    cands = [
        {"id": "1", "name": "Pump A", "tag": "P-001"},
        {"id": "2", "name": "Pump B", "tag": "P-002"},
    ]
    result = find_full_equipment_match("The P-002 is vibrating heavily", cands)
    assert result is not None
    assert result["id"] == "2"


def test_ambiguous_no_full_match_returns_none():
    cands = [
        {"id": "1", "name": "Pump", "tag": "P-001"},
        {"id": "2", "name": "Pumping station", "tag": "PS-001"},
    ]
    # Word "pump" alone is not an unambiguous full match when two names contain it
    # Actually "Pump" exactly matches one, but "Pumping station" does not fully match, so it's a single-hit
    result = find_full_equipment_match("The pump is broken", cands)
    # "Pump" matches name "Pump" exactly, and "Pumping station" does NOT appear in message
    assert result is not None
    assert result["id"] == "1"


def test_case_insensitive():
    cands = [{"id": "1", "name": "Big Bag Loader", "tag": "BBL-1"}]
    assert find_full_equipment_match("big bag loader is stuck", cands)["id"] == "1"
    assert find_full_equipment_match("BIG BAG LOADER alarm", cands)["id"] == "1"


def test_tag_only_wins_when_multiple_name_hits():
    cands = [
        {"id": "1", "name": "Pump", "tag": "P-001"},
        {"id": "2", "name": "Pump", "tag": "P-002"},  # duplicate name
    ]
    # Name alone is ambiguous but tag is not
    result = find_full_equipment_match("The Pump P-002 is leaking", cands)
    assert result is not None
    assert result["id"] == "2"


def test_partial_word_does_not_match():
    cands = [{"id": "1", "name": "Pump", "tag": "P-001"}]
    # "Pumping" is not an exact whole-word match for "Pump"
    assert find_full_equipment_match("Pumping works fine", cands) is None
