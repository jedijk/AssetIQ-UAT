"""Tests for optional discipline request header filtering."""
from __future__ import annotations

from services.discipline_filter import (
    DISCIPLINE_FILTER_HEADER,
    apply_discipline_filter_to_query,
    apply_discipline_filter_to_user,
    discipline_filter_cache_suffix,
    discipline_filter_values,
    read_discipline_filter_ids,
)


class _FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


def test_read_discipline_filter_ids_parses_csv():
    req = _FakeRequest({DISCIPLINE_FILTER_HEADER: "rotating, electrical"})
    assert read_discipline_filter_ids(req) == ["rotating", "electrical"]


def test_apply_discipline_filter_to_user_attaches_ids():
    user = {"id": "u1", "role": "admin"}
    req = _FakeRequest({DISCIPLINE_FILTER_HEADER: "rotating,static"})
    result = apply_discipline_filter_to_user(user, req)
    assert result["_discipline_filter_ids"] == ["rotating", "static"]


def test_discipline_filter_values_normalizes():
    user = {"_discipline_filter_ids": ["Rotating", "rotating", "ELECTRICAL"]}
    values = discipline_filter_values(user)
    assert values == ["rotating", "electrical"]


def test_apply_discipline_filter_to_query_adds_in_clause():
    user = {"_discipline_filter_ids": ["rotating", "static"]}
    query = {"status": "open"}
    merged = apply_discipline_filter_to_query(query, user)
    assert merged["status"] == "open"
    assert merged["discipline"] == {"$in": ["rotating", "static"]}


def test_apply_discipline_filter_to_query_skips_when_impossible():
    user = {"_discipline_filter_ids": ["rotating"]}
    query = {"_impossible": True}
    assert apply_discipline_filter_to_query(query, user) == query


def test_discipline_filter_cache_suffix():
    user = {"_discipline_filter_ids": ["rotating", "static"]}
    assert discipline_filter_cache_suffix(user) == ":disc:rotating,static"
    assert discipline_filter_cache_suffix({"id": "u1"}) == ""
