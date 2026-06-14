"""Wave 18 — unstructured_items tenant collection registration."""
from services.tenant_schema import WAVE9_COLLECTIONS, WAVE_COLLECTIONS


def test_wave9_includes_unstructured_items():
    assert "unstructured_items" in WAVE9_COLLECTIONS
    assert "unstructured_items" in WAVE_COLLECTIONS
