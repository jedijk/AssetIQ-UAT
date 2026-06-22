"""Schema helpers for failure-mode recommended_actions entries."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RecommendedActionEntry(BaseModel):
    """Structured recommended action on a failure mode task."""

    action: Optional[str] = None
    description: Optional[str] = None
    action_type: Optional[str] = "PM"
    task_type: Optional[str] = None
    discipline: Optional[str] = None
    estimated_minutes: Optional[int] = None
    estimated_time: Optional[str] = None
    auto_create: bool = False
    requires_downtime: bool = False
    source: Optional[str] = None
    frequency: Optional[str] = None

    model_config = {"extra": "allow"}


def normalize_recommended_action(action: Any) -> Any:
    """Ensure dict actions include requires_downtime (default false)."""
    if not isinstance(action, dict):
        return action
    normalized = dict(action)
    if normalized.get("requires_downtime") is None:
        normalized["requires_downtime"] = False
    else:
        normalized["requires_downtime"] = bool(normalized["requires_downtime"])
    return normalized


def normalize_recommended_actions(actions: Optional[List[Any]]) -> List[Any]:
    if not actions:
        return []
    return [normalize_recommended_action(a) for a in actions]
