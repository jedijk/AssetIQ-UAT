"""Tests for standard discipline normalization used by PM import."""

from models.disciplines import (
    DEFAULT_DISCIPLINE,
    DISCIPLINE_LIST,
    normalize_discipline,
    normalize_discipline_or_default,
)


def test_mechanical_maps_to_rotating():
    assert normalize_discipline("Mechanical") == "rotating"
    assert normalize_discipline("mechanical") == "rotating"


def test_standard_values_pass_through():
    for value in DISCIPLINE_LIST:
        assert normalize_discipline(value) == value
        assert normalize_discipline(value.title()) == value


def test_legacy_aliases_map_to_standard():
    assert normalize_discipline("Inspection") == "laboratory"
    assert normalize_discipline("Process") == "operations"
    assert normalize_discipline("Maintenance") == "operations"
    assert normalize_discipline("Reliability") == "operations"
    assert normalize_discipline("Piping") == "piping"


def test_unknown_falls_back_to_default():
    assert normalize_discipline_or_default("Mechanical") == "rotating"
    assert normalize_discipline_or_default("not-a-discipline") == DEFAULT_DISCIPLINE
