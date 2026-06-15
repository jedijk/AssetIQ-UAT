"""Wave 5 tenant schema tests."""
from services.tenant_schema import WAVE5_COLLECTIONS, WAVE_COLLECTIONS


def test_wave5_includes_remaining_backlog_collections():
    assert "user_preferences" in WAVE5_COLLECTIONS
    assert "reliability_impacts" in WAVE5_COLLECTIONS
    assert "granulometry_records" in WAVE5_COLLECTIONS


def test_wave_collections_includes_wave5():
    assert WAVE5_COLLECTIONS.issubset(WAVE_COLLECTIONS)
