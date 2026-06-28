"""Tests for universal execute_grounded AI pipeline."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/ai-execute-grounded-test")
os.environ.setdefault("DB_NAME", "ai-execute-grounded-test")
os.environ.setdefault("JWT_SECRET_KEY", "ai-execute-grounded-test")
os.environ.setdefault("ENVIRONMENT", "test")

from models.ai_recommendation import AIRecommendationResponse
from services.ai_recommendation_contract import finalize_ai_recommendation_response


class TestUniversalAIResponseSchema:
    def test_extended_schema_accepts_universal_fields(self):
        payload = finalize_ai_recommendation_response(
            {
                "recommendation": "Inspect bearing",
                "summary": "Inspect bearing",
                "confidence": "medium",
                "graph_path": [{"type": "observation", "label": "High vibration"}],
                "execution_id": "exec-123",
                "ai_model": "gpt-4o",
                "prompt_version": "1.0.0",
            },
            citations=[{"id": "eq-1", "type": "equipment", "label": "Pump"}],
            evidence={"entities": [{"id": "eq-1"}]},
        )
        model = AIRecommendationResponse.from_contract_dict(payload)
        assert model.recommendation == "Inspect bearing"
        assert model.execution_id == "exec-123"
        assert model.evidence_not_available is False
        assert len(model.graph_path) == 1


@pytest.mark.asyncio
async def test_execute_grounded_returns_contract_fields():
    from services.ai_execute_grounded import execute_grounded

    fake_evidence = {
        "citations": [{"id": "c1", "type": "equipment", "label": "Pump"}],
        "entities": [{"id": "eq-1", "type": "equipment"}],
        "graph_edges": [],
        "prompt_summary": "Equipment context",
    }

    with patch(
        "services.ai_execute_grounded.build_evidence_pack",
        new=AsyncMock(return_value=fake_evidence),
    ), patch(
        "services.ai_execute_grounded.log_ai_execution",
        new=AsyncMock(),
    ), patch(
        "services.ai_platform.execute_json_prompt",
        new=AsyncMock(
            return_value={
                "parsed": {"summary": "Check alignment", "recommendations": []},
                "content": "{}",
                "prompt_id": "risk.cause_analysis",
                "prompt_version": "1",
                "model": "gpt-4o",
            }
        ),
    ):
        result = await execute_grounded(
            user={"id": "u1", "company_id": "t1"},
            intent="cause_analysis",
            query="Analyze causes",
            feature="test.feature",
            equipment_id="eq-1",
            prompt_id="risk.cause_analysis",
            parse_json=True,
        )

    assert result["summary"] == "Check alignment"
    assert result["execution_id"]
    assert result["ai_model"] == "gpt-4o"
    assert "evidence_not_available" in result
    assert result["citations"]


@pytest.mark.asyncio
async def test_execute_grounded_vision_returns_damage_fields():
    from services.ai_execute_grounded import execute_grounded

    fake_evidence = {
        "citations": [],
        "entities": [],
        "graph_edges": [],
        "prompt_summary": "Equipment context",
    }
    fake_parsed = {
        "damage_detected": True,
        "confidence": "high",
        "severity": "moderate",
        "findings": [{"type": "corrosion", "description": "Surface rust", "severity": "moderate"}],
        "overall_assessment": "Moderate corrosion visible",
        "recommended_actions": ["Schedule inspection"],
        "requires_immediate_attention": False,
    }

    with patch(
        "services.ai_execute_grounded.build_evidence_pack",
        new=AsyncMock(return_value=fake_evidence),
    ), patch(
        "services.ai_execute_grounded.log_ai_execution",
        new=AsyncMock(),
    ), patch(
        "services.ai_platform.execute_vision_json_prompt",
        new=AsyncMock(
            return_value={
                "parsed": fake_parsed,
                "content": "{}",
                "prompt_id": "vision.damage_analysis",
                "prompt_version": "1",
                "model": "gpt-4o",
            }
        ),
    ):
        result = await execute_grounded(
            user={"id": "u1", "company_id": "t1"},
            intent="damage_analysis",
            query="Analyze damage",
            feature="image_analysis.analyze_damage",
            prompt_id="vision.damage_analysis",
            image_base64="aGVsbG8=",
        )

    assert result["parsed"]["damage_detected"] is True
    assert result["execution_id"]
    assert result["summary"] == "Moderate corrosion visible"


def test_overlay_grounded_contract_preserves_domain_fields():
    from services.ai_execute_grounded import overlay_grounded_contract

    domain = {"success": True, "intent": {"template_id": "open_actions_kpi"}}
    grounded = {
        "execution_id": "exec-1",
        "citations": [{"id": "k1", "type": "kpi"}],
        "evidence_not_available": False,
    }
    merged = overlay_grounded_contract(domain, grounded)
    assert merged["success"] is True
    assert merged["intent"]["template_id"] == "open_actions_kpi"
    assert merged["execution_id"] == "exec-1"
    assert merged["citations"]
