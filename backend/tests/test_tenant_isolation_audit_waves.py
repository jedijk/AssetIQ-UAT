"""Tenant isolation audit — wave 6–11 coverage."""
from services.tenant_isolation_audit import (
    UNSCOPED_BACKLOG,
    collection_audit_entry,
    wave_for_collection,
)
from services.tenant_schema import (
    WAVE10_COLLECTIONS,
    WAVE11_COLLECTIONS,
    WAVE6_COLLECTIONS,
    WAVE_COLLECTIONS,
)


def test_wave6_through_wave11_mapped():
    for name in WAVE6_COLLECTIONS:
        assert wave_for_collection(name) == "wave6"
    for name in WAVE10_COLLECTIONS:
        assert wave_for_collection(name) == "wave10"
    for name in WAVE11_COLLECTIONS:
        assert wave_for_collection(name) == "wave11"


def test_spare_parts_wave11_is_tenant_scoped():
    entry = collection_audit_entry("spare_parts")
    assert entry["wave"] == "wave11"
    assert entry["tenant_scoped"] is True
    assert entry["strict_mode_compatible"] is True


def test_definitions_in_unscoped_backlog():
    assert "definitions" in UNSCOPED_BACKLOG
    entry = collection_audit_entry("definitions")
    assert entry["tenant_scoped"] is False


def test_all_wave_collections_have_wave_assignment():
    for name in WAVE_COLLECTIONS:
        assert wave_for_collection(name) is not None
