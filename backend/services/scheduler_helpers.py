"""Pure scheduler helpers shared by routes and sync services (no route imports)."""
from typing import Any, Dict, List, Optional, Set

from models.maintenance_scheduler import TaskPriority

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


def coerce_optional_str_id(value: Any) -> Optional[str]:
    """Normalize library / BSON ids (often ints) for Pydantic string fields."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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
    fms = strategy.get("failure_mode_strategies") or []
    fm_by_id = {
        str(fm.get("failure_mode_id")): fm
        for fm in fms
        if fm.get("failure_mode_id")
    }

    def _add(tid: str, fm: Dict[str, Any]) -> None:
        if not tid:
            return
        bucket = task_to_fms.setdefault(tid, [])
        if fm not in bucket:
            bucket.append(fm)

    for fm in fms:
        for tid in fm.get("task_ids") or []:
            _add(str(tid), fm)

    # Fallback when FM.task_ids drifted but task.failure_mode_ids still links the FM.
    for task in strategy.get("task_templates") or []:
        tid = str(task.get("id") or "")
        if not tid:
            continue
        for fm_id in task.get("failure_mode_ids") or []:
            fm = fm_by_id.get(str(fm_id))
            if fm:
                _add(tid, fm)

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
        # No FM linkage: standalone template (e.g. manually added).
        return True
    return any(fm.get("enabled") is not False for fm in linked_fms)


_PLANNING_HORIZON = {
    "high": 7,
    "medium": 14,
    "low": 30,
}


def get_planning_horizon(criticality: str) -> int:
    """Get planning horizon days based on criticality."""
    return _PLANNING_HORIZON.get(criticality, 14)


def calculate_priority(criticality: str, days_until_due: int, is_overdue: bool) -> TaskPriority:
    """Calculate task priority based on criticality and due date."""
    if is_overdue:
        if criticality == "high":
            return TaskPriority.CRITICAL
        return TaskPriority.HIGH

    if criticality == "high":
        if days_until_due <= 3:
            return TaskPriority.CRITICAL
        return TaskPriority.HIGH
    if criticality == "medium":
        if days_until_due <= 3:
            return TaskPriority.HIGH
        return TaskPriority.MEDIUM
    if days_until_due <= 3:
        return TaskPriority.MEDIUM
    return TaskPriority.LOW
