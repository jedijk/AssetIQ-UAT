"""
Observation workspace exposure calculations and ALARP progress.

Extracted from observation_workspace_service.py (god-module split).
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

from database import db
from services.production_exposure import PRODUCTION_DOWNTIME_RANGES, production_exposure_monetary_value

_prod_loss_config_cache: Dict[str, tuple] = {}
_PROD_LOSS_CACHE_TTL_SEC = 300


async def resolve_installation_id(equipment_node: Optional[dict]) -> Optional[str]:
    """Find installation id without walking more than necessary."""
    if not equipment_node:
        return None
    if equipment_node.get("level") == "installation":
        return equipment_node.get("id")
    if equipment_node.get("installation_id"):
        return equipment_node.get("installation_id")

    parent_id = equipment_node.get("parent_id")
    for _ in range(15):
        if not parent_id:
            break
        node = await db.equipment_nodes.find_one(
            {"id": parent_id},
            {"_id": 0, "id": 1, "level": 1, "parent_id": 1, "installation_id": 1},
        )
        if not node:
            break
        if node.get("level") == "installation":
            return node.get("id")
        if node.get("installation_id"):
            return node.get("installation_id")
        parent_id = node.get("parent_id")
    return None


async def get_production_loss_config(user_id: str) -> dict:
    now = time.monotonic()
    cached = _prod_loss_config_cache.get(user_id)
    if cached and cached[1] > now:
        return cached[0]
    doc = await db.production_loss_config.find_one({"created_by": user_id}, {"_id": 0}) or {}
    _prod_loss_config_cache[user_id] = (doc, now + _PROD_LOSS_CACHE_TTL_SEC)
    return doc


async def calculate_production_exposure(observation: dict, criticality: dict, user_id: str) -> dict:
    """Calculate production exposure based on criticality, observation data, and user's production loss config"""
    from services.criticality_score import get_criticality_dimensions

    production_impact = get_criticality_dimensions(criticality)["production"]
    if not production_impact:  # None or 0 → not rated on the 1-5 scale
        return {"not_assessed": True, "production_impact_score": None, "formatted_value": "Not Assessed"}
    
    # Fetch user's production loss configuration
    prod_loss_config = await get_production_loss_config(user_id)
    
    # Use config values or defaults
    hourly_cost = (prod_loss_config or {}).get("hourly_cost", 500.0)
    currency = (prod_loss_config or {}).get("currency", "EUR")
    
    # Currency symbols
    currency_symbols = {
        "EUR": "€",
        "USD": "$",
        "GBP": "£",
        "CHF": "CHF ",
        "NOK": "kr ",
        "SEK": "kr ",
        "DKK": "kr "
    }
    currency_symbol = currency_symbols.get(currency, currency + " ")

    min_hours, max_hours = PRODUCTION_DOWNTIME_RANGES.get(production_impact, (8, 24))

    # Maximum exposure value:
    #   - Closed range (max_hours set): max_hours × hourly_cost  → "Up to €X"
    #   - Open-ended (max_hours = None): min_hours × hourly_cost → "More than €X"
    open_ended = max_hours is None
    max_exposure_value = production_exposure_monetary_value(production_impact, hourly_cost)
    
    # Build the human-readable downtime label
    if open_ended:
        downtime_label = f"> {min_hours}"
    elif min_hours == 0 and max_hours == 0:
        downtime_label = "0"
    elif min_hours == 0:
        downtime_label = f"< {max_hours}"
    else:
        downtime_label = f"{min_hours} - {max_hours}"
    
    formatted_value = (
        f"More than {currency_symbol}{max_exposure_value:,.0f}"
        if open_ended
        else f"Up to {currency_symbol}{max_exposure_value:,.0f}"
    )
    
    return {
        "value": max_exposure_value,
        "formatted_value": formatted_value,
        "min_downtime_hours": min_hours,
        "max_downtime_hours": max_hours,
        "downtime_range": downtime_label,
        "open_ended": open_ended,
        "hourly_cost": hourly_cost,
        "currency": currency,
        "production_impact_score": production_impact
    }


def calculate_safety_exposure(observation: dict, criticality: dict) -> dict:
    """Calculate safety exposure based on criticality"""
    from services.criticality_score import get_criticality_dimensions

    safety_impact = get_criticality_dimensions(criticality)["safety"]
    if not safety_impact:
        return {"not_assessed": True, "safety_impact_score": None, "severity": "Not Assessed"}
    
    # Map safety impact to personnel exposure
    personnel_mapping = {
        1: 0,
        2: 1,
        3: 2,
        4: 5,
        5: 10
    }
    
    severity_mapping = {
        1: "Negligible",
        2: "Low",
        3: "Medium",
        4: "High",
        5: "Critical"
    }
    
    return {
        "personnel_exposed": personnel_mapping.get(safety_impact, 0),
        "severity": severity_mapping.get(safety_impact, "Low"),
        "safety_impact_score": safety_impact
    }


def calculate_environmental_exposure(observation: dict, criticality: dict) -> dict:
    """Calculate environmental exposure"""
    from services.criticality_score import get_criticality_dimensions

    env_impact = get_criticality_dimensions(criticality)["environmental"]
    if not env_impact:
        return {"not_assessed": True, "environmental_impact_score": None, "impact_rating": "Not Assessed"}
    
    impact_mapping = {
        1: "Negligible",
        2: "Low",
        3: "Medium",
        4: "High",
        5: "Critical"
    }
    
    return {
        "impact_rating": impact_mapping.get(env_impact, "Low"),
        "environmental_impact_score": env_impact
    }


def calculate_reputation_exposure(observation: dict, criticality: dict) -> dict:
    """Calculate reputation exposure based on criticality.reputation_impact (1-5)."""
    from services.criticality_score import get_criticality_dimensions

    rep_impact = get_criticality_dimensions(criticality)["reputation"]
    if not rep_impact:
        return {"not_assessed": True, "reputation_impact_score": None, "impact_rating": "Not Assessed"}
    impact_mapping = {
        1: "Negligible",
        2: "Low",
        3: "Medium",
        4: "High",
        5: "Critical",
    }
    return {
        "impact_rating": impact_mapping.get(rep_impact, "Low"),
        "reputation_impact_score": rep_impact,
    }


async def get_criticality_definitions_for_equipment(equipment_node: dict, user_id: str) -> List[dict]:
    """
    Resolve the criticality definitions that apply to an equipment node.

    Walks the equipment hierarchy up to the installation (level == 'installation')
    and returns the user's custom criticality definitions saved for that installation
    if any exist. Falls back to the built-in DEFAULT_CRITICALITY otherwise.
    """
    from services.criticality_defaults import DEFAULT_CRITICALITY

    if not equipment_node:
        return DEFAULT_CRITICALITY

    installation_id = await resolve_installation_id(equipment_node)
    if not installation_id:
        return DEFAULT_CRITICALITY

    custom = await db.definitions.find_one(
        {"equipment_id": installation_id, "created_by": user_id},
        {"_id": 0, "criticality": 1},
    )
    if not custom:
        custom = await db.definitions.find_one(
            {"equipment_id": installation_id},
            {"_id": 0, "criticality": 1},
        )

    if custom and custom.get("criticality"):
        return custom["criticality"]
    return DEFAULT_CRITICALITY


async def calculate_alarp_progress(observation: dict, actions: list, investigation: dict = None) -> dict:
    """
    Stage-based mitigation progress aligned with the Process Journey:
        Observation reached               → 10%
        Assessment (FM + Eq + risk)       → +10%
        Planning (≥1 action on plan)      → +10%
        Investigation                     → 0% (optional, no contribution)
        Action — per completed action     → +40% × (completed / total)
        Mitigated (all actions complete)  → 90%
        Learning implemented              → 100%
    """
    progress = 10  # Observation stage reached (the observation exists)

    observation = observation or {}

    # Assessment (+10) — requires failure mode + equipment + risk score
    has_fm = bool(observation.get("failure_mode") or observation.get("failure_mode_id"))
    has_eq = bool(observation.get("linked_equipment_id"))
    has_risk = (observation.get("risk_score") or 0) > 0
    assessment_done = has_fm and has_eq and has_risk
    if assessment_done:
        progress += 10

    # Planning (+10) — at least one action exists on the plan
    total_actions = len(actions) if actions else 0
    planning_done = total_actions > 0
    if planning_done:
        progress += 10

    # Investigation contributes 0% intentionally (optional stage).

    # Action contribution: up to 40% pro-rated by completion ratio.
    completed_count = sum(
        1 for a in (actions or []) if a.get("status") in ("completed", "validated")
    )
    action_pct = 0
    if total_actions > 0:
        if completed_count == total_actions:
            # Mitigated stage reached — promote to 90% regardless of running total.
            progress = 90
        else:
            action_pct = round(40 * completed_count / total_actions)
            progress += action_pct

    # Learning implemented → 100%
    learning_done = any(
        (a.get("action_type") or "").lower() in ("learning", "learn")
        and a.get("status") in ("completed", "validated")
        for a in (actions or [])
    )
    if learning_done:
        progress = 100

    progress = min(progress, 100)

    # Status label reflects the furthest journey stage reached rather than an
    # arbitrary percentage bucket — easier for the user to read at a glance.
    if learning_done:
        status = "Learning Complete"
    elif total_actions > 0 and completed_count == total_actions:
        status = "Mitigated"
    elif total_actions > 0 and completed_count > 0:
        status = "In Action"
    elif planning_done:
        status = "In Planning"
    elif assessment_done:
        status = "In Assessment"
    else:
        status = "Observation"

    return {
        "percentage": progress,
        "status": status,
        "components": {
            "observation": 10,
            "assessment": 10 if assessment_done else 0,
            "planning": 10 if planning_done else 0,
            "investigation": 0,
            "actions": action_pct,
            "learning": 100 if learning_done else 0,
        },
    }


def _fmea_score_from_sources(
    observation: dict,
    failure_mode_data: Optional[dict],
) -> int:
    """Resolve FMEA contribution (0–100) from failure mode RPN or stored threat fields."""
    if failure_mode_data:
        rpn = failure_mode_data.get("rpn")
        if rpn is not None:
            try:
                return min(100, int(float(rpn) / 10))
            except (TypeError, ValueError):
                pass
    for key in ("fmea_score", "base_risk_score"):
        raw = observation.get(key)
        if raw is not None:
            try:
                return min(100, max(0, int(raw)))
            except (TypeError, ValueError):
                continue
    return 50


async def compute_workspace_risk_summary(
    observation: dict,
    criticality: Optional[dict],
    failure_mode_data: Optional[dict],
    installation_id: Optional[str] = None,
) -> dict:
    """
    Derive risk KPI values from the same equipment criticality assessment used by
    exposure cards, blended with FMEA per installation risk settings.
    """
    from services.criticality_score import compute_criticality_score
    from services.threat_score_service import (
        calculate_risk_score,
        get_risk_settings_for_installation,
    )

    fmea_score = _fmea_score_from_sources(observation, failure_mode_data)

    crit_score = 0
    if criticality and isinstance(criticality, dict):
        from services.criticality_score import get_criticality_dimensions

        dims = get_criticality_dimensions(criticality)
        safety = dims["safety"]
        production = dims["production"]
        environmental = dims["environmental"]
        reputation = dims["reputation"]
        if safety or production or environmental or reputation:
            crit_score = compute_criticality_score(
                safety, production, environmental, reputation
            )
        elif criticality.get("risk_score") is not None:
            try:
                stored = float(criticality.get("risk_score"))
                crit_score = min(100, round(stored / 3.5 if stored > 100 else stored))
            except (TypeError, ValueError):
                crit_score = 0
    else:
        crit_score = int(observation.get("criticality_score") or 0)

    risk_settings = await get_risk_settings_for_installation(installation_id or "")
    risk_score, risk_level = calculate_risk_score(crit_score, fmea_score, risk_settings)

    rpn = None
    if failure_mode_data and failure_mode_data.get("rpn") is not None:
        rpn = failure_mode_data.get("rpn")
    else:
        rpn = observation.get("fmea_rpn") or observation.get("rpn")

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "criticality_score": crit_score,
        "fmea_score": fmea_score,
        "rpn": rpn,
    }


