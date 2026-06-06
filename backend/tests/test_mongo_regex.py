"""Tests for MongoDB regex escape helpers."""
from utils.mongo_regex import escape_regex, or_search_fields, case_insensitive_contains


def test_escape_regex_metacharacters():
    assert escape_regex("a+b(c)") == r"a\+b\(c\)"


def test_or_search_fields_builds_or_clause():
    clause = or_search_fields("pump", "name", "email")
    assert "$or" in clause
    assert len(clause["$or"]) == 2
    assert clause["$or"][0]["name"]["$regex"] == "pump"


def test_or_search_fields_empty_search():
    assert or_search_fields("", "name") == {}
    assert or_search_fields("x", "") == {}


def test_case_insensitive_contains():
    match = case_insensitive_contains("valve")
    assert match["$regex"] == "valve"
    assert match["$options"] == "i"
