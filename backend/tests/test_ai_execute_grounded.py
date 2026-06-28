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


@pytest.mark.asyncio
async def test_execute_grounded_registry_prompt_returns_contract_fields():
    from services.ai_execute_grounded import execute_grounded

    fake_evidence = {
        "citations": [{"id": "d1", "type": "document", "label": "Manual"}],
        "entities": [],
        "graph_edges": [],
        "prompt_summary": "",
    }

    with patch(
        "services.ai_execute_grounded.build_evidence_pack",
        new=AsyncMock(return_value=fake_evidence),
    ), patch(
        "services.ai_execute_grounded.log_ai_execution",
        new=AsyncMock(),
    ), patch(
        "services.ai_platform.execute_prompt",
        new=AsyncMock(
            return_value={
                "content": "Check section 3.2 for torque specs.",
                "prompt_id": "forms.document_search",
                "prompt_version": "1",
                "model": "gpt-4o-mini",
            }
        ),
    ):
        result = await execute_grounded(
            user={"id": "u1", "company_id": "t1"},
            intent="document_search",
            query="What is the torque spec?",
            feature="forms.document_search",
            prompt_id="forms.document_search",
            use_registry_prompt=True,
            prompt_variables={"doc_context": "Doc: Manual"},
        )

    assert "torque specs" in (result.get("summary") or "")
    assert result["execution_id"]
    assert result["citations"]


@pytest.mark.asyncio
async def test_scheduler_ai_plan_uses_execute_grounded():
    from unittest.mock import MagicMock

    from services.maintenance_scheduler_ai_service import ai_plan_tasks
    from models.maintenance_scheduler import AIScheduleRequest

    fake_task = {
        "id": "t1",
        "task_name": "Inspect pump",
        "priority": "high",
        "due_date": "2026-07-01",
        "estimated_hours": 2.0,
    }
    fake_grounded = {
        "parsed": {"summary": "Plan ready", "recommendations": [{"task_id": "t1"}]},
        "summary": "Plan ready",
        "execution_id": "exec-sched-1",
        "citations": [],
        "evidence_not_available": True,
    }

    tasks_cursor = MagicMock()
    tasks_cursor.to_list = AsyncMock(return_value=[fake_task])
    tech_cursor = MagicMock()
    tech_cursor.to_list = AsyncMock(return_value=[{"id": "tech1", "name": "Tech One"}])

    mock_scheduled = MagicMock()
    mock_scheduled.find.return_value = tasks_cursor
    mock_tech = MagicMock()
    mock_tech.find.return_value = tech_cursor
    mock_db = MagicMock()
    mock_db.scheduled_tasks = mock_scheduled
    mock_db.technician_capacity = mock_tech

    with patch("services.maintenance_scheduler_ai_service.db", mock_db), patch(
        "services.ai_execute_grounded.execute_grounded",
        new=AsyncMock(return_value=fake_grounded),
    ) as mock_grounded, patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
        result = await ai_plan_tasks(
            {"id": "u1", "company_id": "t1"},
            AIScheduleRequest(start_date="2026-06-01", end_date="2026-06-30"),
        )

    assert result["summary"] == "Plan ready"
    assert result["execution_id"] == "exec-sched-1"
    mock_grounded.assert_awaited_once()


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
