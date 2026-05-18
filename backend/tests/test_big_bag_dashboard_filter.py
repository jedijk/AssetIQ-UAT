"""Big Bag dashboard inclusion — first load of the day must not be dropped by shift filters."""
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

from routes.production import (
    _calendar_day_in_envelope,
    _naive_shift_windows,
    _parse_sample_datetime,
    _in_any_time_window,
    _shift_windows_for_day,
)


def test_parse_production_date_day_first():
    d = _parse_sample_datetime("18/05/2026")
    assert d is not None
    assert d.day == 18 and d.month == 5 and d.year == 2026


def test_big_bag_early_utc_submission_included_by_calendar_day():
    """06:00 local (CEST) often stored as 04:00 UTC — still same calendar day as dashboard."""
    target = datetime(2026, 5, 18, tzinfo=timezone.utc)
    windows = _shift_windows_for_day(["morning"], target)
    cal_start, cal_end = windows[0][0], windows[0][1]
    # Extend envelope like dashboard does for single-day mode
    from routes.production import _envelope_windows

    cal_env_start, cal_env_end = _envelope_windows(windows)

    submitted_utc = datetime(2026, 5, 18, 4, 0, tzinfo=timezone.utc)
    in_shift_utc = _in_any_time_window(submitted_utc, windows)
    assert in_shift_utc is False

    assert _calendar_day_in_envelope(submitted_utc, cal_env_start, cal_env_end) is True

    dt_wall = submitted_utc.replace(tzinfo=None)
    in_shift_wall = _in_any_time_window(dt_wall, _naive_shift_windows(windows))
    assert in_shift_wall is False
