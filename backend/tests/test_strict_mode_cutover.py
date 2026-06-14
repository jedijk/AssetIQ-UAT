"""Wave 6 strict mode cutover tests."""
from services.tenant_schema import WAVE5_COLLECTIONS, WAVE_COLLECTIONS


def test_all_waves_in_wave_collections():
    assert WAVE5_COLLECTIONS.issubset(WAVE_COLLECTIONS)


def test_strict_mode_defaults_off():
    import importlib
    import services.tenant_schema as ts

    importlib.reload(ts)
    assert ts.TENANT_STRICT_MODE is False
