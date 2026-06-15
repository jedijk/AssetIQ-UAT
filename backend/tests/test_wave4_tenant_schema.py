"""Wave 4 tenant schema tests."""
from services.tenant_schema import WAVE4_COLLECTIONS


def test_wave4_includes_chat_and_production_logs():
    assert "chat_messages" in WAVE4_COLLECTIONS
    assert "production_logs" in WAVE4_COLLECTIONS
    assert "task_templates" in WAVE4_COLLECTIONS


def test_wave_collections_includes_wave4():
    from services.tenant_schema import WAVE_COLLECTIONS

    assert WAVE4_COLLECTIONS.issubset(WAVE_COLLECTIONS)
