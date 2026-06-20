"""Shared constants and helpers for PM import processing."""

import re
import math
from datetime import datetime, date
from typing import Any, Dict, Optional

PM_IMPORT_DISPLAY_STATUSES = ("pending", "applied", "merged")


def normalize_pm_import_display_status(task: Dict[str, Any]) -> str:
    """Map stored task fields to the three user-facing import statuses."""
    import_status = (task.get("import_status") or "pending").lower()
    apply_mode = (task.get("apply_mode") or "").lower()

    if import_status == "merged":
        return "merged"
    if import_status == "applied":
        return "applied"
    if import_status == "implemented":
        if apply_mode in ("replaced", "existing"):
            return "merged"
        return "applied"
    return "pending"


def is_pm_import_review_accepted(task: Dict[str, Any]) -> bool:
    """Imported tasks are accepted by default unless explicitly rejected."""
    status = (task.get("review_status") or "pending").lower()
    return status != "rejected"


def is_pm_import_task_active(task: Dict[str, Any]) -> bool:
    """Whether a PM import task is enabled for scheduling (separate from review accept/reject)."""
    return task.get("is_active", True) is not False


# Mongo match for enabled PM import rows after $unwind on tasks_extracted.
PM_IMPORT_UNWOUND_ENABLED_TASK_MATCH = {"tasks_extracted.is_active": {"$ne": False}}


def _sanitize_for_json(value: Any) -> Any:
    """Recursively convert MongoDB / Python values to JSON-safe types."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return value
    if isinstance(value, str):
        return value
    try:
        from bson import ObjectId
        if isinstance(value, ObjectId):
            return str(value)
    except ImportError:
        pass
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return {str(k): _sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_for_json(v) for v in value]
    return str(value)

# Tag-like equipment identifier extraction (best-effort).
# Examples: P-101, HX-201, 1F-3001, 1F-3001-0129
TAG_REGEX = re.compile(
    r"\b(?:"
    r"[A-Z]{1,5}\s*-\s*\d{2,6}(?:-\d{2,6})?"          # P-101, 1F-3001, 1F-3001-0129
    r"|"
    r"\d{1,3}[A-Z]{1,5}\s*-\s*\d{2,6}(?:-\d{2,6})?"   # 1F-3001 (number+letters prefix)
    r")\b"
)

# Task type classifications
TASK_TYPES = [
    "Inspection",
    "Lubrication",
    "Calibration",
    "Replacement",
    "Cleaning",
    "Adjustment",
    "Monitoring",
    "Unknown"
]

# Maintenance action type (CM / PM / PDM)
ACTION_TYPES = ["PM", "PDM", "CM"]

# Map task type → default action_type and discipline (standard taxonomy values)
# PM = Preventive (time-based), PDM = Predictive (condition-based), CM = Corrective
TASK_TYPE_DEFAULTS = {
    "Inspection":   {"action_type": "PM",  "discipline": "laboratory"},
    "Lubrication":  {"action_type": "PM",  "discipline": "rotating"},
    "Calibration":  {"action_type": "PM",  "discipline": "instrumentation"},
    "Replacement":  {"action_type": "PM",  "discipline": "rotating"},
    "Cleaning":     {"action_type": "PM",  "discipline": "static"},
    "Adjustment":   {"action_type": "PM",  "discipline": "rotating"},
    "Monitoring":   {"action_type": "PDM", "discipline": "operations"},
    "Unknown":      {"action_type": "PM",  "discipline": "operations"},
}

# Discipline detection via component keywords (overrides task-type defaults)
DISCIPLINE_KEYWORDS = {
    "electrical": [
        "cable", "wire", "switchgear", "transformer", "breaker", "fuse",
        "relay", "circuit", "panel", "motor winding", "vfd", "drive",
        "schakelaar", "kabel"
    ],
    "instrumentation": [
        "sensor", "transmitter", "controller", "plc", "gauge", "indicator",
        "level switch", "flow meter", "pressure transmitter", "temperature transmitter",
        "calibrate", "calibration", "kalibreer", "control valve", "positioner"
    ],
    "piping": [
        "process line", "piping", "line", "leiding", "strainer", "separator"
    ],
    "static": [
        "tank", "vessel", "column", "reactor", "exchanger", "heat exchanger",
        "filter", "scrubber", "drum"
    ],
    "rotating": [
        "pump", "compressor", "motor", "fan", "blower", "turbine",
        "bearing", "seal", "gear", "gearbox", "coupling", "shaft",
        "belt", "chain", "roller", "conveyor", "valve body",
        "pomp", "lager", "tandwiel", "ventilator"
    ],
    "operations": [
        "operator", "operation", "sample", "sampling", "round", "rounds", "walkthrough",
        "operator round", "shift check", "daily check", "process check", "visual round",
        "buitendienst", "bemonstering", "ronde", "operator check"
    ],
    "laboratory": [
        "inspect", "inspection", "visual check", "examine", "verify", "controleer"
    ],
    "civil": [
        "foundation", "structure", "concrete", "steelwork", "building"
    ],
}

# Action type detection via task text keywords (overrides task-type defaults)
ACTION_TYPE_KEYWORDS = {
    "PDM": [
        "vibration analysis", "vibration monitoring", "thermography",
        "thermal imaging", "oil analysis", "trillingsanalyse",
        "ultrasonic", "condition monitor", "trend", "predictive",
        "motor current signature", "infrared", "acoustic emission"
    ],
    "CM": [
        "repair", "fix", "rebuild", "restore after failure", "corrective",
        "herstel", "repareer"
    ],
}

# Keyword-based pre-classification rules
TASK_CLASSIFICATION_RULES = {
    "lubrication": {
        "keywords": ["grease", "lubricate", "oil", "smeer", "vet", "lub", "lube"],
        "failure_modes": ["Lubrication starvation", "Bearing wear", "Bearing seizure", "Overheating"],
        "failure_mechanisms": ["Insufficient lubrication", "Grease contamination", "Grease degradation"],
        "detection_methods": ["Temperature monitoring", "Vibration analysis", "Noise detection", "Visual inspection"]
    },
    "inspection": {
        "keywords": ["inspect", "visual check", "controleer", "listen", "leakage", "check pressure", "check", "examine", "verify", "control"],
        "failure_modes": ["Leak", "Abnormal noise", "Loose part", "Crack", "Pressure loss", "Overheating", "Corrosion"],
        "failure_mechanisms": ["Wear", "Fatigue", "Corrosion", "Loosening"],
        "detection_methods": ["Visual inspection", "Auditory check", "Pressure measurement", "Temperature monitoring"]
    },
    "calibration": {
        "keywords": ["calibrate", "kalibreren", "adjust", "afstellen", "tune", "zero", "set point"],
        "failure_modes": ["Sensor drift", "False reading", "Instrument failure", "Measurement error"],
        "failure_mechanisms": ["Sensor degradation", "Electronic drift", "Environmental effects"],
        "detection_methods": ["Reference comparison", "Trend analysis", "Deviation monitoring"]
    },
    "replacement": {
        "keywords": ["replace", "vervangen", "overhaul", "flush", "change", "renew", "swap"],
        "failure_modes": ["Consumable degradation", "Contamination", "Wear-out", "Fluid degradation"],
        "failure_mechanisms": ["Age-related degradation", "Contamination buildup", "Material fatigue"],
        "detection_methods": ["Time-based schedule", "Condition monitoring", "Sample analysis"]
    },
    "cleaning": {
        "keywords": ["clean", "reinig", "cooling", "blow out", "spoelen", "wash", "purge", "filter"],
        "failure_modes": ["Fouling", "Overheating", "Blockage", "Contamination", "Reduced efficiency"],
        "failure_mechanisms": ["Buildup accumulation", "Debris collection", "Scale formation"],
        "detection_methods": ["Visual inspection", "Pressure drop measurement", "Temperature monitoring"]
    },
    "adjustment": {
        "keywords": ["adjust", "tension", "align", "tighten", "torque", "set", "position"],
        "failure_modes": ["Misalignment", "Loose components", "Belt slip", "Coupling failure"],
        "failure_mechanisms": ["Vibration loosening", "Thermal expansion", "Wear"],
        "detection_methods": ["Alignment check", "Torque verification", "Vibration analysis"]
    },
    "monitoring": {
        "keywords": ["monitor", "record", "log", "measure", "track", "observe", "trend"],
        "failure_modes": ["Performance degradation", "Abnormal operation", "Efficiency loss"],
        "failure_mechanisms": ["Progressive wear", "System degradation"],
        "detection_methods": ["Trend analysis", "Threshold monitoring", "Data logging"]
    }
}

# Frequency pattern matching
FREQUENCY_PATTERNS = [
    (r'\b(daily|dagelijks)\b', 'Daily'),
    (r'\b(weekly|wekelijks)\b', 'Weekly'),
    (r'\b(bi-weekly|tweewekelijks)\b', 'Bi-weekly'),
    (r'\b(monthly|maandelijks)\b', 'Monthly'),
    (r'\b(quarterly|driemaandelijks|kwartaal)\b', 'Quarterly'),
    (r'\b(semi-annual|halfjaarlijks)\b', 'Semi-annual'),
    (r'\b(annual|yearly|jaarlijks)\b', 'Annual'),
    (r'\bevery\s+(\d+)\s*hours?\b', 'Every {0} hours'),
    (r'\bevery\s+(\d+)\s*days?\b', 'Every {0} days'),
    (r'\bevery\s+(\d+)\s*weeks?\b', 'Every {0} weeks'),
    (r'\bevery\s+(\d+)\s*months?\b', 'Every {0} months'),
    (r'\b(\d+)\s*hours?\b', 'Every {0} hours'),
    (r'\b(\d+)\s*h\b', 'Every {0} hours'),
]

# Estimated duration pattern matching (time required to execute the task)
# Captures "30 min", "2 hours", "1.5 hrs", "45 minutes", Dutch "minuten", "uur"
DURATION_PATTERNS = [
    (r'\b(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|uur|uren|hr)\b', 'hours'),
    (r'\b(\d+)\s*(?:minutes?|mins?|min|minuten)\b', 'minutes'),
    (r'\b(\d+)\s*m\b(?!o)', 'minutes'),  # "30m" but not "month"
]


def normalize_pm_import_discipline(value: Optional[str]) -> str:
    """Map PM import discipline text to the standard taxonomy (e.g. Mechanical → rotating)."""
    from models.disciplines import normalize_discipline_or_default

    return normalize_discipline_or_default(value)

