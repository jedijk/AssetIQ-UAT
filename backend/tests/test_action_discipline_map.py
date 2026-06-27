"""Tests for failure-mode action discipline mapping."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.failure_modes.action_discipline_map import (
    build_alias_map,
    normalize_discipline_value,
)

TAXONOMY = [
    {
        "value": "rotating",
        "label": "Rotating",
        "aliases": ["mechanical"],
    },
    {
        "value": "operations",
        "label": "Operations",
        "aliases": ["safety"],
    },
]


def test_normalize_maps_settings_aliases():
    alias_map = build_alias_map(TAXONOMY)
    assert normalize_discipline_value("mechanical", TAXONOMY, alias_map) == "rotating"
    assert normalize_discipline_value("Safety", TAXONOMY, alias_map) == "operations"


def test_normalize_unknown_returns_empty():
    alias_map = build_alias_map(TAXONOMY)
    assert normalize_discipline_value("zzzz_unknown", TAXONOMY, alias_map) == ""
