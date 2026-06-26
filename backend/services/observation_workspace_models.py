"""
Observation workspace models and payload helpers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from database import db
from services.tenant_schema import merge_tenant_filter

_OBSERVATION_PAYLOAD_EXCLUDE = frozenset({"_id", "recommended_actions"})


async def _find_observation(observation_id: str, user: Optional[dict]) -> Optional[dict]:
    return await db.threats.find_one(
        merge_tenant_filter({"id": observation_id}, user),
        {"_id": 0},
    )


def _build_observation_payload(observation: dict, equipment_node: Optional[dict] = None) -> dict:
    """Full observation fields for workspace + details section (single source, no second GET)."""
    payload = {k: v for k, v in observation.items() if k not in _OBSERVATION_PAYLOAD_EXCLUDE}
    if equipment_node:
        tag = equipment_node.get("tag") or equipment_node.get("tag_number")
        if tag:
            payload["equipment_tag"] = tag
    return payload


class ExposureData(BaseModel):
    """Risk & Exposure data for an observation"""

    production_exposure: Dict[str, Any]
    safety_exposure: Dict[str, Any]
    environmental_exposure: Dict[str, Any]
    alarp_progress: Dict[str, Any]
    risk_summary: Dict[str, Any]


class TimelineEvent(BaseModel):
    """A single event in the equipment reliability timeline"""

    id: str
    date: str
    event_type: str
    title: str
    reference_id: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None


class ReliabilityIntelligence(BaseModel):
    """AI-driven reliability analysis"""

    most_likely_cause: Dict[str, Any]
    supporting_evidence: Dict[str, Any]
    contributing_factors: List[Dict[str, Any]]
    ai_confidence: float


class RecommendedAction(BaseModel):
    """A recommended action from library or AI"""

    id: str
    action_type: str
    title: str
    source: str
    expected_impact: Optional[str] = None
    confidence: Optional[float] = None
    why_recommended: Optional[str] = None
    failure_mode_id: Optional[str] = None


class ActionPlanItem(BaseModel):
    """An action in the mitigation action plan"""

    id: str
    action_number: str
    title: str
    status: str
    priority: str
    owner: Optional[str] = None
    due_date: Optional[str] = None


class ProcessStage(BaseModel):
    """A stage in the process journey"""

    stage: str
    status: str
    date: Optional[str] = None
    owner: Optional[str] = None
