"""Wave 7 tenant schema tests — Wave 12 scheduler + extraction collections."""
from services.tenant_schema import WAVE7_COLLECTIONS, WAVE_COLLECTIONS


def test_wave7_includes_scheduler_and_extraction_collections():
    for name in (
        "ai_extraction_corrections",
        "maintenance_history",
        "technician_capacity",
        "custom_equipment_types",
    ):
        assert name in WAVE7_COLLECTIONS


def test_wave_collections_includes_wave7():
    assert WAVE7_COLLECTIONS.issubset(WAVE_COLLECTIONS)
