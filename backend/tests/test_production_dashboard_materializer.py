"""Tests for production dashboard materializer."""
from services.production_dashboard_materializer import dashboard_cache_key


def test_dashboard_cache_key_stable_for_same_params():
    a = dashboard_cache_key(date="2026-05-19", from_date=None, to_date=None, shift="morning")
    b = dashboard_cache_key(date="2026-05-19", from_date=None, to_date=None, shift="morning")
    assert a == b


def test_dashboard_cache_key_differs_for_shift():
    morning = dashboard_cache_key(date="2026-05-19", from_date=None, to_date=None, shift="morning")
    night = dashboard_cache_key(date="2026-05-19", from_date=None, to_date=None, shift="night")
    assert morning != night
