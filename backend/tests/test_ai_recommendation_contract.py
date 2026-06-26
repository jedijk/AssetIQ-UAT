"""AI recommendation contract — evidence/citation enforcement."""
from services.ai_citation import make_citation
from services.ai_recommendation_contract import (
    enrich_recommendations_with_evidence,
    finalize_ai_recommendation_response,
    validate_ai_recommendation_response,
)


def test_finalize_sets_evidence_not_available_without_citations():
    payload = finalize_ai_recommendation_response(
        {"recommendations": [{"action": "Inspect seal", "impact": "high"}]},
        citations=[],
    )
    assert payload["evidence_not_available"] is True
    assert payload["citations"] == []
    assert validate_ai_recommendation_response(payload) == []


def test_finalize_enriches_critical_recommendations_with_real_citations():
    cites = [
        make_citation(
            id="obs-1",
            type="observation",
            label="Seal leak observation",
            url_path="/threats/obs-1",
        )
    ]
    payload = finalize_ai_recommendation_response(
        {
            "recommendations": [
                {"action": "Replace seal", "impact": "critical"},
            ],
        },
        citations=cites,
    )
    assert payload["evidence_not_available"] is False
    rec = payload["recommendations"][0]
    assert rec["confidence"] == "medium"
    assert rec["source_refs"] == ["obs-1"]
    assert rec["supporting_evidence"][0]["citation_id"] == "obs-1"
    assert validate_ai_recommendation_response(payload) == []


def test_validate_flags_missing_evidence_flag():
    violations = validate_ai_recommendation_response(
        {"recommendations": [], "citations": []},
    )
    assert any("evidence_not_available" in v for v in violations)


def test_enrich_does_not_invent_citations_when_none_supplied():
    recs = enrich_recommendations_with_evidence(
        [{"action": "Check bearings", "impact": "high"}],
        [],
    )
    assert recs[0] == {"action": "Check bearings", "impact": "high"}


def test_ai_risk_analysis_response_shape():
    """Unit-level contract for analyze_threat_risk finalization helper usage."""
    from services.ai_recommendation_contract import finalize_ai_recommendation_response as finalize

    threat_id = "threat-abc"
    cites = [
        make_citation(
            id=threat_id,
            type="observation",
            label="High vibration on P-104",
            url_path=f"/threats/{threat_id}",
        )
    ]
    raw = {
        "threat_id": threat_id,
        "recommendations": [{"action": "Vibration analysis", "impact": "high"}],
        "dynamic_risk": {"risk_score": 120, "confidence": "medium"},
    }
    out = finalize(raw, citations=cites, evidence={"entities": [{"id": threat_id}]})
    assert out["evidence_not_available"] is False
    assert out["recommendations"][0]["source_refs"] == [threat_id]
    assert validate_ai_recommendation_response(out) == []


def test_maintenance_program_recommendations_contract():
    cites = [
        make_citation(
            id="obs-99",
            type="observation",
            label="Past seal failure",
            url_path="/threats/obs-99",
        )
    ]
    payload = finalize_ai_recommendation_response(
        {
            "recommendations": [
                {
                    "task_title": "Inspect mechanical seal",
                    "impact": "high",
                    "reasoning": "Historical seal failures on this equipment",
                }
            ],
        },
        citations=cites,
        recommendations_key="recommendations",
    )
    assert payload["evidence_not_available"] is False
    assert payload["recommendations"][0]["source_refs"] == ["obs-99"]
