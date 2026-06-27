"""Regression tests for AI photo extraction date normalization."""
import os
from datetime import datetime, timezone

import pytest

pytest.importorskip("email_validator")

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from routes.ai_extract import (
    _calibrate_date_value_to_capture,
    _expand_two_digit_year,
    _normalize_date_value,
)


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


def test_two_digit_year_near_capture_not_2016():
    ref = datetime(2026, 5, 19, tzinfo=timezone.utc).date()
    assert _normalize_date_value("19-05-16", "date", ref) == "2026-05-19"
    assert _expand_two_digit_year(16, 5, 19, ref) == 2026


def test_calibrate_year_mismatch_snaps_to_capture():
    ref = datetime(2026, 5, 19, 12, 0, tzinfo=timezone.utc)
    value, conf, adjusted = _calibrate_date_value_to_capture("2016-05-18", "date", ref, 0.9)
    assert adjusted is True
    assert value == "2026-05-19"
    assert conf <= 0.28


def test_calibrate_plausible_date_unchanged():
    ref = datetime(2026, 5, 19, 12, 0, tzinfo=timezone.utc)
    value, conf, adjusted = _calibrate_date_value_to_capture("2026-05-10", "date", ref, 0.9)
    assert adjusted is False
    assert value == "2026-05-10"
    assert conf == 0.9
