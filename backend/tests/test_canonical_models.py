"""WS3 canonical data model registry tests."""
from pathlib import Path

from architecture.canonical_models import (
    CANONICAL_MODELS,
    WS3_DOMAINS,
    validate_model_files,
    validate_ws3_coverage,
)

BACKEND = Path(__file__).resolve().parents[1]


def test_ws3_domains_fully_registered():
    assert validate_ws3_coverage() == []
    assert WS3_DOMAINS == set(CANONICAL_MODELS.keys())


def test_canonical_service_files_exist():
    assert validate_model_files(BACKEND) == []


def test_each_domain_has_canonical_collection_and_service():
    for model in CANONICAL_MODELS.values():
        assert model.canonical_collections
        assert model.canonical_service.endswith(".py")
        assert model.api_routes


def test_maintenance_programs_legacy_flags_documented():
    mp = CANONICAL_MODELS["maintenance_programs"]
    assert "maintenance_programs_v2" in mp.canonical_collections
    assert "maintenance_programs" in mp.legacy_collections
    assert mp.legacy_write_flag == "SYNC_LEGACY_MAINTENANCE_PROGRAMS"


def test_observations_dual_collection_documented():
    obs = CANONICAL_MODELS["observations"]
    assert "threats" in obs.canonical_collections
    assert "observations" in obs.canonical_collections
