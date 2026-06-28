"""Schema validation for the universal AI recommendation contract."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from models.ai_recommendation import AIRecommendationResponse
from services.ai_recommendation_contract import validate_ai_recommendation_response


def coerce_ai_recommendation_response(payload: Dict[str, Any]) -> AIRecommendationResponse:
    """Parse and coerce a response dict into AIRecommendationResponse."""
    return AIRecommendationResponse.from_contract_dict(payload)


def validate_ai_recommendation_schema(payload: Dict[str, Any]) -> List[str]:
    """
    Return contract violations for a user-facing AI payload.

    Combines lightweight contract rules with Pydantic structural validation.
    """
    violations = list(validate_ai_recommendation_response(payload))
    try:
        coerce_ai_recommendation_response(payload)
    except Exception as exc:
        violations.append(f"schema: {exc}")
    if payload.get("evidence_not_available") is None:
        violations.append("missing evidence_not_available flag")
    return violations


def assert_ai_recommendation_schema(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Validate payload; raise ValueError when contract violations exist."""
    violations = validate_ai_recommendation_schema(payload)
    if violations:
        raise ValueError("; ".join(violations))
    return payload
