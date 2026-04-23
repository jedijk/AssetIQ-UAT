"""Regression tests for AI photo extraction date normalization."""
from routes.ai_extract import _normalize_date_value


def test_iso_date_passthrough():
    assert _normalize_date_value("2024-07-21", "date") == "2024-07-21"


def test_slash_iso_date():
    assert _normalize_date_value("2024/07/21", "date") == "2024-07-21"


def test_european_dash_date():
    assert _normalize_date_value("21-07-2024", "date") == "2024-07-21"


def test_european_slash_date():
    assert _normalize_date_value("21/07/2024", "date") == "2024-07-21"


def test_european_dot_date():
    assert _normalize_date_value("21.07.2024", "date") == "2024-07-21"


def test_two_digit_year():
    assert _normalize_date_value("21-7-24", "date") == "2024-07-21"


def test_dutch_month():
    assert _normalize_date_value("21 juli 2024", "date") == "2024-07-21"


def test_english_month():
    assert _normalize_date_value("21 July 2024", "date") == "2024-07-21"


def test_datetime_european():
    assert _normalize_date_value("21-07-2024 14:30", "datetime") == "2024-07-21T14:30"


def test_datetime_iso():
    assert _normalize_date_value("2024-07-21T14:30", "datetime") == "2024-07-21T14:30"


def test_empty():
    assert _normalize_date_value("", "date") is None


def test_invalid():
    assert _normalize_date_value("invalid", "date") is None
