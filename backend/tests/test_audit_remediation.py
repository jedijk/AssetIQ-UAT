"""Audit remediation: config flags, legacy sunset, metadata propagation keys."""
from services.scheduler_config import (
    should_read_legacy_maintenance_programs,
    should_sync_legacy_maintenance_programs,
)


def test_legacy_read_disabled_by_default(monkeypatch):
    monkeypatch.delenv("READ_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    monkeypatch.delenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", raising=False)
    assert should_read_legacy_maintenance_programs() is False
    assert should_sync_legacy_maintenance_programs() is False


def test_metadata_propagation_keys_exclude_structural():
    from routes.maintenance_strategy_v2.routes import METADATA_PROPAGATION_KEYS

    assert "failure_mode_ids" not in METADATA_PROPAGATION_KEYS
    assert "is_mandatory" not in METADATA_PROPAGATION_KEYS
    assert "name" in METADATA_PROPAGATION_KEYS
    assert "frequency_matrix" in METADATA_PROPAGATION_KEYS


def test_legacy_v1_mutation_blocked():
    from routes.maintenance import _block_legacy_v1_mutation
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as exc:
        _block_legacy_v1_mutation()
    assert exc.value.status_code == 410
