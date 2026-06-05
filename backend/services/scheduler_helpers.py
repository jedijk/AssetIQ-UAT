"""Pure scheduler helpers shared by routes and sync services (no route imports)."""
from typing import Any, Dict, List, Optional, Set

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
    if not program.get("is_active", True):
        return False
    return program_has_active_strategy(program, active_strategy_type_ids)


def build_task_to_failure_modes(strategy: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Map strategy task template id -> failure mode strategies that reference it."""
    task_to_fms: Dict[str, List[Dict[str, Any]]] = {}
    for fm in strategy.get("failure_mode_strategies") or []:
        for tid in fm.get("task_ids") or []:
            if tid:
                task_to_fms.setdefault(tid, []).append(fm)
    return task_to_fms


def is_strategy_task_active(
    task: Dict[str, Any],
    failure_mode_strategies: Optional[List[Dict[str, Any]]] = None,
    task_to_fms: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> bool:
    """
    Whether a strategy task template should produce maintenance programs.

    Matches the Maintenance Strategy UI:
      - is_mandatory must not be False
      - reactive/corrective tasks are excluded from scheduling
      - standalone tasks (no FM linkage) are active when mandatory
      - FM-linked tasks are active when at least one linked FM is enabled
    """
    if not task or not task.get("id"):
        return False
    if task.get("is_mandatory") is False:
        return False
    task_type = task.get("task_type", "preventive")
    if task_type in ("reactive", "corrective"):
        return False

    if task_to_fms is None:
        task_to_fms = build_task_to_failure_modes(
            {"failure_mode_strategies": failure_mode_strategies or []}
        )

    linked_fms = task_to_fms.get(task["id"], [])
    if not linked_fms:
        return True
    return any(fm.get("enabled") is not False for fm in linked_fms)
