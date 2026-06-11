"""
Production exposure calculations shared by observation workspace and executive dashboard.

Downtime ranges align with default Production Criticality definitions (1–5 scale).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

# (min_hours, max_hours). max_hours = None means open-ended (> min_hours).
PRODUCTION_DOWNTIME_RANGES: Dict[int, Tuple[int, Optional[int]]] = {
    1: (0, 0),       # Minimal — no production impact / redundancy available
    2: (0, 8),       # Low — downtime < 8 hours
    3: (8, 24),      # Medium — downtime 8–24 hours
    4: (24, 72),     # High — downtime > 24 hours (upper bound 72)
    5: (72, None),   # Critical — complete plant shutdown (> 72 hours, open-ended)
}


def production_impact_from_criticality(criticality: Any) -> int:
    """Return production impact score (1–5) from equipment criticality, or 0 if not assessed."""
    if not criticality:
        return 0
    if isinstance(criticality, dict):
        return int(criticality.get("production_impact") or criticality.get("production") or 0)
    if isinstance(criticality, (int, float)):
        return int(criticality)
    return 0


def production_exposure_hours(production_impact: int) -> float:
    """
    Highest hours from the production criticality assessment range.
    Open-ended level 5 uses the minimum bound (72h) as the floor for monetary value.
    """
    if not production_impact:
        return 0.0
    min_hours, max_hours = PRODUCTION_DOWNTIME_RANGES.get(production_impact, (8, 24))
    if max_hours is None:
        return float(min_hours)
    return float(max_hours)


def production_exposure_monetary_value(production_impact: int, hourly_cost: float) -> float:
    """Monetary production exposure using max assessment hours × hourly cost."""
    if not production_impact:
        return 0.0
    return production_exposure_hours(production_impact) * hourly_cost


def calculate_total_equipment_lifecycle_exposure(
    equipment_nodes: List[dict],
    hourly_cost: float,
) -> Tuple[float, int]:
    """
    Sum production exposure for all equipment with an assessed production criticality score.
    """
    total = 0.0
    count = 0
    for equipment in equipment_nodes or []:
        impact = production_impact_from_criticality(equipment.get("criticality"))
        if not impact:
            continue
        total += production_exposure_monetary_value(impact, hourly_cost)
        count += 1
    return total, count


def equipment_assessed_exposure_value(equipment: dict, hourly_cost: float) -> float:
    """Monetary exposure for one equipment item, or 0 when not assessed."""
    impact = production_impact_from_criticality(equipment.get("criticality"))
    if not impact:
        return 0.0
    return production_exposure_monetary_value(impact, hourly_cost)


def calculate_covered_assessed_exposure(
    equipment_nodes: List[dict],
    covered_equipment_ids: set,
    hourly_cost: float,
) -> Tuple[float, int]:
    """
    Sum assessed production exposure for equipment covered by a maintenance program.
    """
    total = 0.0
    count = 0
    for equipment in equipment_nodes or []:
        equipment_id = equipment.get("id")
        if not equipment_id or equipment_id not in covered_equipment_ids:
            continue
        value = equipment_assessed_exposure_value(equipment, hourly_cost)
        if value <= 0:
            continue
        total += value
        count += 1
    return total, count


def calculate_uncovered_assessed_exposure(
    equipment_nodes: List[dict],
    covered_equipment_ids: set,
    hourly_cost: float,
) -> Tuple[float, int]:
    """
    Sum assessed production exposure for equipment without a maintenance program.
    """
    total = 0.0
    count = 0
    for equipment in equipment_nodes or []:
        equipment_id = equipment.get("id")
        if not equipment_id or equipment_id in covered_equipment_ids:
            continue
        value = equipment_assessed_exposure_value(equipment, hourly_cost)
        if value <= 0:
            continue
        total += value
        count += 1
    return total, count
