"""Shared helpers for onboarding validation scoring and explanations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.onboarding_constants import PHASE_EFFORT_MINUTES, PHASE_LABELS, PHASE_ORDER, PHASE_WEIGHTS


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def status_from_score(score: float) -> str:
    if score >= 100:
        return "passed"
    if score >= 60:
        return "warning"
    return "action_required"


def check(status: str, message: str, *, code: str, detail: Optional[dict] = None) -> dict:
    return {
        "code": code,
        "status": status,
        "message": message,
        "detail": detail or {},
    }


def check_tally(checks: List[dict]) -> dict:
    return {
        "passed": sum(1 for c in checks if c.get("status") == "passed"),
        "warning": sum(1 for c in checks if c.get("status") == "warning"),
        "action_required": sum(1 for c in checks if c.get("status") == "action_required"),
        "total": len(checks),
    }


def detail_from_checks(checks: List[dict], code: str, key: str, default: Any = 0) -> Any:
    for item in checks:
        if item.get("code") == code:
            return item.get("detail", {}).get(key, default)
    return default


def phase_score_explanation(result: dict) -> str:
    phase = result.get("phase", "")
    score = result.get("score", 0)
    checks = result.get("checks") or []
    tally = check_tally(checks)

    if phase == "equipment":
        dupes = detail_from_checks(checks, "duplicate_tags", "duplicates", [])
        depth = detail_from_checks(checks, "hierarchy_depth", "levels", [])
        parts = ["Hierarchy health starts at 100%"]
        if detail_from_checks(checks, "equipment_count", "equipment_count", 0) == 0:
            parts.append("no equipment → 0%")
        else:
            if dupes:
                parts.append(f"{len(dupes)} duplicate tag(s) reduce score")
            if len(depth) < 2:
                parts.append("shallow hierarchy (−15%)")
        parts.append(f"→ {score}%")
        return "; ".join(parts)

    if phase == "users":
        user_count = detail_from_checks(checks, "user_count", "user_count", 0)
        base = "100% with 2+ users" if user_count >= 2 else ("60% with 1 user" if user_count == 1 else "0% with no users")
        assigned = any(c.get("code") == "installation_assignments" and c.get("status") == "passed" for c in checks)
        bonus = "; +20% for installation assignments" if assigned and score < 100 else ""
        return f"{base}{bonus} → {score}%"

    if phase == "failure_modes":
        coverage = detail_from_checks(checks, "type_coverage", "type_coverage_percent", 0)
        customer = detail_from_checks(checks, "customer_failure_modes", "count", 0)
        if customer > 0:
            return f"50% base + half of equipment type coverage ({coverage}%) → {score}%"
        return f"No customer failure modes yet → {score}%"

    if phase == "maintenance_strategy":
        coverage = result.get("coverage_percent", detail_from_checks(checks, "coverage_percent", "coverage_percent", 0))
        needs_apply = detail_from_checks(checks, "strategy_needs_apply", "count", 0)
        parts = []
        if coverage or any(c.get("code") == "maintenance_programs" and c.get("status") == "passed" for c in checks):
            parts.append(f"40% base + half of program coverage ({coverage}%)")
        if needs_apply == 0 and any(c.get("code") == "active_strategies" and c.get("status") == "passed" for c in checks):
            parts.append("+20% when strategies applied")
        return ("; ".join(parts) if parts else "No maintenance programs yet") + f" → {score}%"

    if phase == "criticality":
        return f"Risk settings (40%) + criticality definitions (30%) + subunit/maintainable assessment coverage (30%) → {score}%"

    if phase == "spare_parts":
        coverage = result.get(
            "equipment_coverage_percent",
            detail_from_checks(checks, "spare_parts_linked", "equipment_coverage_percent", 0),
        )
        linked = detail_from_checks(checks, "spare_parts_linked", "linked_count", 0)
        if linked > 0:
            return f"60% when spares exist; +40% from equipment linkage coverage ({coverage}%) → {score}%"
        return f"60% when spares exist; link spares to equipment for up to +40% → {score}%"

    if phase == "go_live":
        blocking = [c.get("message") for c in checks if c.get("status") == "action_required"]
        if blocking:
            return f"Blocked by {len(blocking)} mandatory phase(s) → {score}%"
        return f"Average of weighted mandatory phases → {score}%"

    if tally["total"]:
        return (
            f"{tally['passed']}/{tally['total']} checks passed"
            f" · {tally['warning']} warning(s)"
            f" · {tally['action_required']} action required → {score}%"
        )
    return f"Score: {score}%"


def enrich_validation(result: dict) -> dict:
    checks = result.get("checks") or []
    enriched = dict(result)
    enriched["check_tally"] = check_tally(checks)
    enriched["score_explanation"] = phase_score_explanation(enriched)
    return enriched


def readiness_breakdown(phase_results: Dict[str, dict]) -> dict:
    equipment = phase_results.get("equipment", {}).get("score", 0)
    failure_modes = phase_results.get("failure_modes", {}).get("score", 0)
    maintenance = phase_results.get("maintenance_strategy", {}).get("score", 0)
    criticality = phase_results.get("criticality", {}).get("score", 0)

    overall_components = []
    for phase_id, weight in PHASE_WEIGHTS.items():
        phase_score = phase_results.get(phase_id, {}).get("score", 0)
        overall_components.append(
            {
                "phase_id": phase_id,
                "label": PHASE_LABELS.get(phase_id, phase_id),
                "weight_percent": round(weight * 100),
                "score": phase_score,
                "contribution": round((phase_score / 100.0) * weight * 100, 1),
            }
        )

    data_phases = [
        ("company", phase_results.get("company", {}).get("score", 0)),
        ("users", phase_results.get("users", {}).get("score", 0)),
        ("equipment", equipment),
        ("forms", phase_results.get("forms", {}).get("score", 0)),
        ("spare_parts", phase_results.get("spare_parts", {}).get("score", 0)),
    ]

    return {
        "overall": {
            "formula": "Sum of (phase score × phase weight)",
            "components": overall_components,
        },
        "reliability": {
            "formula": "Failure Modes × 50% + Criticality × 30% + Equipment × 20%",
            "components": [
                {"label": "Failure Modes", "phase_id": "failure_modes", "weight_percent": 50, "score": failure_modes},
                {"label": "Criticality", "phase_id": "criticality", "weight_percent": 30, "score": criticality},
                {"label": "Equipment", "phase_id": "equipment", "weight_percent": 20, "score": equipment},
            ],
        },
        "maintenance": {
            "formula": "Maintenance Strategy × 70% + Failure Modes × 30%",
            "components": [
                {"label": "Maintenance Strategy", "phase_id": "maintenance_strategy", "weight_percent": 70, "score": maintenance},
                {"label": "Failure Modes", "phase_id": "failure_modes", "weight_percent": 30, "score": failure_modes},
            ],
        },
        "data_quality": {
            "formula": "Average of Company, Users, Equipment, Forms, Spare Parts scores",
            "components": [
                {"label": PHASE_LABELS.get(pid, pid), "phase_id": pid, "weight_percent": 20, "score": sc}
                for pid, sc in data_phases
            ],
        },
        "go_live": {
            "formula": "100% only when all mandatory phases pass; otherwise average of weighted phases",
            "components": overall_components,
        },
        "ai_readiness": {
            "formula": "Average of Failure Modes and Maintenance Strategy scores",
            "components": [
                {"label": "Failure Modes", "phase_id": "failure_modes", "weight_percent": 50, "score": failure_modes},
                {"label": "Maintenance Strategy", "phase_id": "maintenance_strategy", "weight_percent": 50, "score": maintenance},
            ],
        },
    }


def estimate_time_remaining(phase_results: Dict[str, dict]) -> int:
    minutes = 0
    for phase_id in PHASE_ORDER:
        score = phase_results.get(phase_id, {}).get("score", 0)
        if score < 100:
            effort = PHASE_EFFORT_MINUTES.get(phase_id, 10)
            remaining_fraction = (100 - score) / 100.0
            minutes += int(effort * remaining_fraction)
    return minutes


def outstanding_actions(phase_results: Dict[str, dict]) -> List[dict]:
    actions: List[dict] = []
    for phase_id in PHASE_ORDER:
        result = phase_results.get(phase_id, {})
        if result.get("status") in ("action_required", "warning"):
            for item in result.get("checks", []):
                if item.get("status") in ("action_required", "warning"):
                    actions.append(
                        {
                            "phase": phase_id,
                            "phase_label": PHASE_LABELS.get(phase_id, phase_id),
                            "code": item.get("code"),
                            "status": item.get("status"),
                            "message": item.get("message"),
                        }
                    )
    return actions[:20]


def serialize_phases(phase_results: Dict[str, dict]) -> List[dict]:
    phases = []
    for phase_id in PHASE_ORDER:
        result = phase_results.get(phase_id, {})
        phases.append(
            {
                "id": phase_id,
                "label": PHASE_LABELS.get(phase_id, phase_id),
                "weight": PHASE_WEIGHTS.get(phase_id, 0),
                "score": result.get("score", 0),
                "status": result.get("status", "action_required"),
                "effort_minutes": PHASE_EFFORT_MINUTES.get(phase_id, 10),
                "check_tally": result.get("check_tally"),
                "score_explanation": result.get("score_explanation"),
            }
        )
    return phases
