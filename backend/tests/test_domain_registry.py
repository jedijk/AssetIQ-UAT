"""Tests for domain registry — Wave 3 modularization."""
from architecture.domain_registry import DOMAINS, list_domains


def test_all_expected_domains_registered():
    expected = {
        "equipment",
        "failure_modes",
        "strategies",
        "maintenance_programs",
        "work_execution",
        "observations",
        "threats",
        "investigations",
        "actions",
        "reliability_graph",
        "reliability_intelligence",
        "production",
        "forms",
        "user_management",
        "analytics",
        "platform",
    }
    assert expected.issubset(set(list_domains()))


def test_platform_domain_includes_event_outbox():
    platform = DOMAINS["platform"]
    assert any("event_outbox" in s for s in platform.services)
