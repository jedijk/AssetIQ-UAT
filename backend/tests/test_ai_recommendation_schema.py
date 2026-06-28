"""AI recommendation schema validation tests."""
from models.ai_recommendation import AIRecommendationResponse
from services.ai_citation import make_citation
from services.ai_recommendation_schema import (
    coerce_ai_recommendation_response,
    validate_ai_recommendation_schema,
)


def test_coerce_ai_recommendation_response():
    payload = {
        "summary": "Inspect seal weekly",
        "recommendations": [{"action": "Inspect seal", "impact": "high"}],
        "citations": [],
        "evidence_not_available": True,
    }
    model = coerce_ai_recommendation_response(payload)
    assert isinstance(model, AIRecommendationResponse)
    assert model.evidence_not_available is True


def test_validate_schema_accepts_compliant_payload():
    cites = [
        make_citation(
            id="obs-1",
            type="observation",
            label="Leak",
            url_path="/threats/obs-1",
        )
    ]
    payload = {
        "summary": "Replace seal",
        "recommendations": [
            {
                "action": "Replace seal",
                "impact": "critical",
                "confidence": "high",
                "source_refs": ["obs-1"],
            }
        ],
        "citations": cites,
        "evidence_not_available": False,
    }
    assert validate_ai_recommendation_schema(payload) == []


def test_validate_schema_flags_missing_evidence_flag():
    violations = validate_ai_recommendation_schema(
        {"recommendations": [], "citations": []},
    )
    assert any("evidence_not_available" in v for v in violations)
