"""Workspace exposure KPIs must align with observation criticality snapshot and score modal."""
import pytest

from services.criticality_score import resolve_observation_criticality
from services.observation_workspace_exposure import (
    _fmea_score_from_sources,
    calculate_production_exposure,
    compute_workspace_risk_summary,
)


def test_fmea_score_from_failure_mode_rpn():
    assert _fmea_score_from_sources({}, {"severity": 5, "occurrence": 5, "detectability": 5}) == 13
    assert _fmea_score_from_sources({}, {"rpn": 125}) == 13


def test_resolve_observation_criticality_prefers_snapshot_over_equipment_node():
    observation = {
        "equipment_criticality_data": {
            "safety_impact": 1,
            "production_impact": 3,
            "environmental_impact": 1,
            "reputation_impact": 1,
        }
    }
    equipment_node = {
        "criticality": {
            "safety_impact": 1,
            "production_impact": 1,
            "environmental_impact": 1,
            "reputation_impact": 1,
        }
    }
    resolved = resolve_observation_criticality(observation, equipment_node)
    assert resolved["production_impact"] == 3


@pytest.mark.asyncio
async def test_production_exposure_uses_observation_criticality_snapshot(monkeypatch):
    async def _mock_config(_user_id):
        return {"hourly_cost": 500.0, "currency": "EUR"}

    monkeypatch.setattr(
        "services.observation_workspace_exposure.get_production_loss_config",
        _mock_config,
    )
    observation = {
        "equipment_criticality_data": {
            "safety_impact": 1,
            "production_impact": 3,
            "environmental_impact": 1,
            "reputation_impact": 1,
        }
    }
    equipment_node = {
        "criticality": {
            "safety_impact": 1,
            "production_impact": 1,
            "environmental_impact": 1,
            "reputation_impact": 1,
        }
    }
    criticality = resolve_observation_criticality(observation, equipment_node)
    exposure = await calculate_production_exposure(observation, criticality, "user-1")
    assert exposure["production_impact_score"] == 3
    assert exposure["downtime_range"] == "8 - 24"


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
    assert summary["fmea_score"] == 13
    assert summary["risk_score"] == 18
    assert summary["risk_level"] == "Low"
    assert summary["rpn"] == 125
