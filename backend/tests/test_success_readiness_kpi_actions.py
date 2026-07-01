"""Tests for Success Readiness KPI improvement actions."""
from services.success_readiness_kpi_actions import (
    improvement_actions_for_kpi,
    primary_action_for_kpi,
)


def test_all_catalog_kpis_have_improvement_actions():
    from services.success_readiness_models import KPI_CATALOG

    for spec in KPI_CATALOG:
        actions = improvement_actions_for_kpi(spec["id"])
        assert len(actions) >= 1
        assert actions[0]["label"]
        assert actions[0]["description"]


def test_primary_action_for_kpi():
    label = primary_action_for_kpi("training_completion")
    assert "training" in label.lower()
