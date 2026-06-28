"""Shared Pydantic models for user-facing AI recommendation responses."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class AICitation(BaseModel):
    id: str
    type: str
    label: Optional[str] = None
    url_path: Optional[str] = None
    snippet: Optional[str] = None


class AIRecommendationItem(BaseModel):
    """Single recommendation — fields vary by surface; extras allowed."""

    model_config = {"extra": "allow"}

    action: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    impact: Optional[str] = None
    priority: Optional[str] = None
    confidence: Optional[str] = None
    confidence_level: Optional[str] = None
    source_refs: Optional[List[str]] = None
    citation_ids: Optional[List[str]] = None
    supporting_evidence: Optional[List[Dict[str, Any]]] = None
    reasoning: Optional[str] = None


class AIRecommendationResponse(BaseModel):
    """
    Universal AI recommendation contract (functional spec Sprint 3).

    All user-facing AI recommendation endpoints should return this shape
    (directly or as a superset via extra fields).
    """

    model_config = {"extra": "allow"}

    summary: Optional[str] = None
    recommendations: List[Union[AIRecommendationItem, Dict[str, Any]]] = Field(
        default_factory=list
    )
    citations: List[Union[AICitation, Dict[str, Any]]] = Field(default_factory=list)
    evidence_not_available: bool = True
    deterministic_inputs: Optional[Dict[str, Any]] = None
    limitations: Optional[List[str]] = None
    confidence: Optional[str] = None

    @classmethod
    def from_contract_dict(cls, payload: Dict[str, Any]) -> "AIRecommendationResponse":
        """Coerce a finalized contract dict into the shared response model."""
        data = dict(payload)
        if "evidence" in data and "deterministic_inputs" not in data:
            ev = data.get("evidence")
            if isinstance(ev, dict) and "deterministic" in ev:
                data["deterministic_inputs"] = ev.get("deterministic")
        return cls.model_validate(data)
