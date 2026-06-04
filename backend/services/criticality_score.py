"""Shared criticality score calculation (aligned with observation / threat UI)."""

from typing import Any, Dict, Optional


def compute_criticality_score(
    safety: int = 0,
    production: int = 0,
    environmental: int = 0,
    reputation: int = 0,
) -> int:
    """
    Normalized 0–100 score from four 1–5 dimension ratings.
    Same formula as observation page: weighted sum / 3.5.
    """
    raw = (safety * 25) + (production * 20) + (environmental * 15) + (reputation * 10)
    return min(100, round(raw / 3.5))


def resolve_equipment_criticality_score(criticality: Any) -> Optional[int]:
    """
    Normalized 0–100 score for equipment criticality display.
    Prefer four dimension ratings; legacy risk_score values above 100 are raw sums / 3.5.
    """
    if not criticality or not isinstance(criticality, dict):
        return None

    safety = int(criticality.get("safety_impact") or 0)
    production = int(criticality.get("production_impact") or 0)
    environmental = int(criticality.get("environmental_impact") or 0)
    reputation = int(criticality.get("reputation_impact") or 0)

    if safety or production or environmental or reputation:
        return compute_criticality_score(safety, production, environmental, reputation)

    stored = criticality.get("risk_score")
    if stored is None:
        return None
    try:
        value = float(stored)
    except (TypeError, ValueError):
        return None
    if value > 100:
        return min(100, round(value / 3.5))
    return min(100, round(value))
