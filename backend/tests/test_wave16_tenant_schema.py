"""Wave 16 — equipment_files tenant collection registration."""
from services.tenant_schema import WAVE8_COLLECTIONS, WAVE_COLLECTIONS


def test_wave8_includes_equipment_files():
    assert "equipment_files" in WAVE8_COLLECTIONS
    assert "equipment_files" in WAVE_COLLECTIONS
