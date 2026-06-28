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
    Universal AI recommendation contract (functional spec — AI Platform Completion).

    All user-facing AI endpoints return this shape (directly or as a superset).
    """

    model_config = {"extra": "allow"}

    recommendation: Optional[str] = None
    summary: Optional[str] = None
    confidence: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    citations: List[Union[AICitation, Dict[str, Any]]] = Field(default_factory=list)
    related_entities: List[Dict[str, Any]] = Field(default_factory=list)
    graph_path: List[Dict[str, Any]] = Field(default_factory=list)
    assumptions: Optional[List[str]] = None
    limitations: Optional[List[str]] = None
    evidence_not_available: bool = True
    suggested_actions: List[Union[AIRecommendationItem, Dict[str, Any]]] = Field(
        default_factory=list
    )
    recommendations: List[Union[AIRecommendationItem, Dict[str, Any]]] = Field(
        default_factory=list
    )
    deterministic_inputs: Optional[Dict[str, Any]] = None
    generated_at: Optional[str] = None
    ai_model: Optional[str] = None
    prompt_version: Optional[str] = None
    prompt_id: Optional[str] = None
    execution_id: Optional[str] = None

    @classmethod
    def from_contract_dict(cls, payload: Dict[str, Any]) -> "AIRecommendationResponse":
        """Coerce a finalized contract dict into the shared response model."""
        data = dict(payload)
        if "evidence" in data and "deterministic_inputs" not in data:
            ev = data.get("evidence")
            if isinstance(ev, dict) and "deterministic" in ev:
                data["deterministic_inputs"] = ev.get("deterministic")
        return cls.model_validate(data)
