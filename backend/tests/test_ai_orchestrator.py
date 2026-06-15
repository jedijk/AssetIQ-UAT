"""AI orchestrator smoke tests — Convergence Phase 4."""
from unittest.mock import AsyncMock, patch

import pytest

from services.ai_orchestrator import run_grounded_recommendation


@pytest.mark.asyncio
async def test_run_grounded_recommendation_smoke():
    evidence = {
        "citations": [{"id": "eq-1", "type": "equipment", "label": "Pump", "url_path": "/equipment/eq-1"}],
        "prompt_summary": "Equipment: Pump health=70",
        "entities": [],
        "kpis": {},
        "graph_edges": [],
    }

    with patch(
        "services.ai_orchestrator.build_evidence_pack",
        new_callable=AsyncMock,
        return_value=evidence,
    ), patch(
        "services.ai_orchestrator.ai_gateway_chat",
        new_callable=AsyncMock,
        return_value="Pump P-104 is high risk [cite:eq-1].\n\nSources:\n- eq-1",
    ):
        result = await run_grounded_recommendation(
            user={"id": "u-1", "company_id": "co-1"},
            intent="risk_analysis",
            equipment_id="eq-1",
            query="Why is this pump high risk?",
        )

    assert "answer" in result
    assert result["citations"][0]["id"] == "eq-1"
    assert result["evidence"]["prompt_summary"].startswith("Equipment")
