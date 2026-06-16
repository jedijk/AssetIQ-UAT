"""Workspace risk KPI must follow live equipment criticality, not stale threat scores."""
import pytest

from services.observation_workspace_exposure import (
    _fmea_score_from_sources,
    compute_workspace_risk_summary,
)


def test_fmea_score_from_failure_mode_rpn():
    assert _fmea_score_from_sources({}, {"rpn": 125}) == 12


@pytest.mark.asyncio
async def test_workspace_risk_summary_uses_equipment_criticality():
    observation = {"risk_score": 60, "risk_level": "Medium", "fmea_score": 50}
    criticality = {
        "safety_impact": 1,
        "production_impact": 1,
        "environmental_impact": 1,
        "reputation_impact": 1,
    }
    summary = await compute_workspace_risk_summary(
        observation,
        criticality,
        {"rpn": 125},
    )
    assert summary["criticality_score"] == 20
    assert summary["fmea_score"] == 12
    assert summary["risk_score"] == 18
    assert summary["risk_level"] == "Low"
    assert summary["rpn"] == 125
