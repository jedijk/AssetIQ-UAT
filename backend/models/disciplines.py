"""
Standard discipline values used across PM import, tasks, actions, and FMEA.

Aligned with:
- iso14224_models.Discipline
- frontend/src/constants/disciplines.js
- routes/disciplines.py SEED_DISCIPLINES
"""

from enum import Enum
from typing import Dict, List, Optional, Tuple


class StandardDiscipline(str, Enum):
    ROTATING = "rotating"
    STATIC = "static"
    PIPING = "piping"
    ELECTRICAL = "electrical"
    INSTRUMENTATION = "instrumentation"
    CIVIL = "civil"
    OPERATIONS = "operations"
    LABORATORY = "laboratory"


DISCIPLINE_LIST: List[str] = [d.value for d in StandardDiscipline]
DEFAULT_DISCIPLINE = StandardDiscipline.ROTATING.value

# (value, label, aliases) — keep in sync with SEED_DISCIPLINES / frontend constants
_STANDARD_DISCIPLINE_ROWS: Tuple[Tuple[str, str, Tuple[str, ...]], ...] = (
    ("rotating", "Rotating", ("mechanical", "rotating equipment", "mech", "td", "tech", "technisch", "werktuigbouw")),
    ("static", "Static", ("static equipment",)),
    ("piping", "Piping", ()),
    ("electrical", "Electrical", ("e&i", "elec", "elektro")),
    ("instrumentation", "Instrumentation", ("inst", "instr", "i&c")),
    ("civil", "Civil", ()),
    (
        "operations",
        "Operations",
        (
            "process",
            "maintenance",
            "safety",
            "reliability",
            "multi-discipline",
            "multi_discipline",
            "engineering",
            "ops",
            "op",
            "oper",
            "bediening",
            "maint",
            "onderhoud",
            "hvac",
        ),
    ),
    ("laboratory", "Laboratory", ("inspection", "lab")),
)

DISCIPLINE_LABELS: Dict[str, str] = {value: label for value, label, _ in _STANDARD_DISCIPLINE_ROWS}
DISCIPLINE_LABEL_LIST: List[str] = [label for _, label, _ in _STANDARD_DISCIPLINE_ROWS]

_ALIAS_TO_VALUE: Dict[str, str] = {}
for value, label, aliases in _STANDARD_DISCIPLINE_ROWS:
    _ALIAS_TO_VALUE[value] = value
    _ALIAS_TO_VALUE[label.lower()] = value
    _ALIAS_TO_VALUE[label.lower().replace(" ", "_")] = value
    for alias in aliases:
        _ALIAS_TO_VALUE[alias.lower()] = value
        _ALIAS_TO_VALUE[alias.lower().replace(" ", "_").replace("-", "_")] = value


def _lookup_key(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def normalize_discipline(value: Optional[str]) -> str:
    """
    Normalize a discipline string to a canonical lowercase value (e.g. rotating).
    Returns empty string when input is blank or cannot be mapped.
    """
    if not value or not str(value).strip():
        return ""

    raw = str(value).strip()
    for key in (_lookup_key(raw), raw.lower()):
        mapped = _ALIAS_TO_VALUE.get(key)
        if mapped:
            return mapped

    return ""


def normalize_discipline_or_default(value: Optional[str]) -> str:
    """Normalize discipline; fall back to DEFAULT_DISCIPLINE when unknown."""
    return normalize_discipline(value) or DEFAULT_DISCIPLINE
