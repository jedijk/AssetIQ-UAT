"""AI evidence pack unit tests — Convergence Phase 4."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.ai_citation import attach_citations_to_response, format_citations_for_prompt, make_citation
from services.ai_evidence_pack import build_evidence_pack


def test_make_citation_and_format_for_prompt():
    cites = [
        make_citation(id="eq-1", type="equipment", label="Pump P-104", url_path="/equipment/eq-1"),
        make_citation(id="edge-9", type="graph_edge", label="path", url_path="/equipment/eq-1/reliability-graph?edge=edge-9"),
    ]
    text = format_citations_for_prompt(cites)
    assert "[cite:<id>]" in text
    assert "eq-1" in text
    assert "edge-9" in text


def test_attach_citations_to_response():
    out = attach_citations_to_response({"answer": "ok"}, [{"id": "x"}], evidence={"kpis": {}})
    assert out["answer"] == "ok"
    assert out["citations"][0]["id"] == "x"
    assert out["evidence"]["kpis"] == {}


@pytest.mark.asyncio
async def test_build_evidence_pack_equipment_scope():
    mock_state = {
        "found": True,
        "health_score": 62.0,
        "risk_level": "High",
        "open_observation_count": 2,
        "overdue_pm_count": 1,
        "exposure": {"score": 55.0},
        "graph_edge_count": 3,
        "canonical_source": "equipment_reliability_state",
    }
    mock_risk = {
        "path_entries": [
            {
                "edge_id": "e1",
                "relation": "caused_by",
                "source": "obs-1",
                "target": "fm-1",
            }
        ]
    }
    mock_ctx = {
        "found": True,
        "equipment": {"id": "eq-1", "name": "Pump", "tag": "P-104"},
        "open_threats": [{"id": "t-1", "title": "Leak", "risk_level": "High", "risk_score": 70}],
        "graph": {"edge_count": 3},
    }

    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.threats.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(
        return_value=[{"id": "t-1", "title": "Leak", "status": "Open", "risk_score": 70, "risk_level": "High"}]
    )

    with patch(
        "services.ai_evidence_pack.build_equipment_reliability_state",
        new_callable=AsyncMock,
        return_value=mock_state,
    ), patch(
        "services.ai_evidence_pack.GraphTraversalService"
    ) as mock_graph_cls, patch(
        "services.ai_evidence_pack.ReliabilityContextService"
    ) as mock_ctx_cls:
        mock_graph_cls.return_value.explain_risk = AsyncMock(return_value=mock_risk)
        mock_ctx_cls.return_value.get_context = AsyncMock(return_value=mock_ctx)

        pack = await build_evidence_pack(
            user={"id": "u-1", "company_id": "co-1"},
            equipment_id="eq-1",
            intent="risk_analysis",
            database=mock_db,
        )

    assert pack["equipment_id"] == "eq-1"
    assert pack["kpis"]["equipment"]["health_score"] == 62.0
    assert len(pack["graph_edges"]) == 1
    assert any(c["id"] == "eq-1" for c in pack["citations"])
    assert any(c["id"] == "e1" for c in pack["citations"])
    assert "Pump" in pack["prompt_summary"]


@pytest.mark.asyncio
async def test_build_evidence_pack_fleet_only():
    fleet = {
        "unified_open_signals": 12,
        "high_risk_threats": 3,
        "overdue_pm": {"total": 5},
    }
    with patch(
        "services.ai_evidence_pack.compute_fleet_reliability_summary",
        new_callable=AsyncMock,
        return_value=fleet,
    ):
        pack = await build_evidence_pack(
            user={"id": "u-1", "company_id": "co-1"},
            intent="general_summary",
            include_fleet=True,
        )

    assert pack["kpis"]["fleet"]["unified_open_signals"] == 12
    assert any(c["id"] == "fleet-reliability" for c in pack["citations"])
