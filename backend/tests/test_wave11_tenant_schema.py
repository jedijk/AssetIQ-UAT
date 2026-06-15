"""Wave 6 tenant schema tests — Wave 11 tenant hardening."""
from services.tenant_schema import WAVE6_COLLECTIONS, WAVE_COLLECTIONS


def test_wave6_includes_ai_and_outbox_collections():
    for name in (
        "ai_risk_insights",
        "ai_causal_analysis",
        "ai_fault_trees",
        "ai_bow_ties",
        "ai_action_optimization",
        "domain_event_outbox",
    ):
        assert name in WAVE6_COLLECTIONS


def test_wave_collections_includes_wave6():
    assert WAVE6_COLLECTIONS.issubset(WAVE_COLLECTIONS)
