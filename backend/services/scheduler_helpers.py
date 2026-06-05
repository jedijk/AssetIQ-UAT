"""Pure scheduler helpers shared by routes and sync services (no route imports)."""

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
