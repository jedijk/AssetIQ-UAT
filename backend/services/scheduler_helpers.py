"""Pure scheduler helpers shared by routes and sync services (no route imports)."""
from typing import Any, Dict, Set

STRATEGY_EXEMPT_TASK_SOURCES = frozenset(
    {
        "customer_imported",
        "manual",
        "ai_generated",
        "equipment_specific",
    }
)

_FREQUENCY_DAYS = {
    "continuous": 1,
    "daily": 1,
    "weekly": 7,
    "bi_weekly": 14,
    "monthly": 30,
    "quarterly": 90,
    "semi_annual": 180,
    "annual": 365,
    "biennial": 730,
    "on_condition": 30,
}


def frequency_to_days(frequency: str) -> int:
    """Convert frequency string to days."""
    return _FREQUENCY_DAYS.get(frequency, 30)


def normalize_program_criticality(raw) -> str:
    """Map equipment/RPN criticality labels to high|medium|low."""
    if raw is None:
        return "low"
    if isinstance(raw, dict):
        level = raw.get("level") or raw.get("value") or raw.get("rating")
        if level is not None:
            raw = level
    label = str(raw).strip().lower().replace(" ", "_")
    if label in ("high", "medium", "low"):
        return label
    if label in (
        "critical",
        "very_high",
        "severe",
        "urgent",
        "safety_critical",
        "production_critical",
    ):
        return "high"
    if label in ("moderate", "normal", "average"):
        return "medium"
    return "low"


def program_is_strategy_backed(program: Dict[str, Any]) -> bool:
    """True when a legacy scheduler program depends on an equipment-type strategy."""
    source = (program.get("task_source") or "").lower()
    if source in STRATEGY_EXEMPT_TASK_SOURCES:
        return False
    if program.get("pm_import_task_id"):
        return False
    return True


def program_has_active_strategy(program: Dict[str, Any], active_strategy_type_ids: Set[str]) -> bool:
    """True when the program's strategy or equipment type still has a strategy document."""
    for key in ("strategy_id", "equipment_type_id"):
        value = program.get(key)
        if value and value in active_strategy_type_ids:
            return True
    return False


def program_is_schedulable(program: Dict[str, Any], active_strategy_type_ids: Set[str]) -> bool:
    """Whether run-scheduler should generate occurrences for this program."""
    if not program_is_strategy_backed(program):
        return True
    return program_has_active_strategy(program, active_strategy_type_ids)
