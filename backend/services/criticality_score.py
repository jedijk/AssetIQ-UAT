"""Shared criticality score calculation (aligned with observation / threat UI)."""

from typing import Any, Dict, Optional


def get_criticality_dimensions(criticality: Any) -> Dict[str, int]:
    """Normalize S/P/E/R impact values from equipment or observation snapshot."""
    if not criticality or not isinstance(criticality, dict):
        return {"safety": 0, "production": 0, "environmental": 0, "reputation": 0}
    return {
        "safety": int(criticality.get("safety_impact") or criticality.get("safety") or 0),
        "production": int(
            criticality.get("production_impact") or criticality.get("production") or 0
        ),
        "environmental": int(
            criticality.get("environmental_impact") or criticality.get("environmental") or 0
        ),
        "reputation": int(
            criticality.get("reputation_impact") or criticality.get("reputation") or 0
        ),
    }


def criticality_has_assessment(criticality: Any) -> bool:
    dims = get_criticality_dimensions(criticality)
    return any(dims.values())


def resolve_observation_criticality(
    observation: Optional[dict],
    equipment_node: Optional[dict],
) -> Optional[dict]:
    """
    Criticality for workspace exposure KPIs and risk summary.

    Prefers observation.equipment_criticality_data (matches Score Calculation modal
    and stored threat risk_score). Falls back to live equipment node criticality.
    """
    snap = (observation or {}).get("equipment_criticality_data")
    if snap and isinstance(snap, dict) and criticality_has_assessment(snap):
        return snap
    if equipment_node:
        node_crit = equipment_node.get("criticality")
        if node_crit and isinstance(node_crit, dict) and criticality_has_assessment(node_crit):
            return node_crit
    if snap and isinstance(snap, dict):
        return snap
    if equipment_node:
        return equipment_node.get("criticality")
    return None


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

    if not (safety or production or environmental or reputation):
        dims = get_criticality_dimensions(criticality)
        safety = dims["safety"]
        production = dims["production"]
        environmental = dims["environmental"]
        reputation = dims["reputation"]

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
