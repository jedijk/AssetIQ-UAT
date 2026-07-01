"""Onboarding workspace phase definitions and weights."""
from __future__ import annotations

from typing import Dict, List

# Progress weights from functional spec (sum = 1.0)
PHASE_WEIGHTS: Dict[str, float] = {
    "company": 0.02,
    "users": 0.05,
    "equipment": 0.20,
    "failure_modes": 0.20,
    "maintenance_strategy": 0.20,
    "forms": 0.05,
    "spare_parts": 0.05,
    "external_api": 0.05,
    "visual_boards": 0.05,
    "criticality": 0.08,
    "go_live": 0.05,
}

# Sites is a guided step without its own weight; completion feeds equipment readiness.
UNWEIGHTED_PHASES = {"sites"}

# Phases that may be skipped without blocking go-live.
OPTIONAL_PHASES = {"external_api"}

PHASE_ORDER: List[str] = [
    "company",
    "sites",
    "equipment",
    "users",
    "criticality",
    "failure_modes",
    "maintenance_strategy",
    "spare_parts",
    "forms",
    "visual_boards",
    "external_api",
    "go_live",
]

PHASE_LABELS: Dict[str, str] = {
    "company": "Company",
    "sites": "Sites",
    "equipment": "Equipment",
    "users": "Users",
    "criticality": "Criticality",
    "failure_modes": "Failure Modes",
    "maintenance_strategy": "Maintenance Strategy",
    "spare_parts": "Spare Parts",
    "forms": "Digital Forms",
    "visual_boards": "Visual Management",
    "external_api": "External API",
    "go_live": "Go Live",
}

PHASE_EFFORT_MINUTES: Dict[str, int] = {
    "company": 5,
    "sites": 10,
    "equipment": 45,
    "users": 15,
    "criticality": 20,
    "failure_modes": 45,
    "maintenance_strategy": 45,
    "spare_parts": 20,
    "forms": 15,
    "visual_boards": 15,
    "external_api": 15,
    "go_live": 10,
}

ENTRY_PATHS = {
    "equipment_list": {
        "label": "I have an Equipment List",
        "description": "Start with equipment import",
        "start_phase": "equipment",
    },
    "pm_procedures": {
        "label": "I have PM Procedures",
        "description": "Start with PM import",
        "start_phase": "failure_modes",
    },
    "pid_drawings": {
        "label": "I have P&IDs or Drawings",
        "description": "Start with AI process import",
        "start_phase": "equipment",
    },
    "spare_parts": {
        "label": "I have Spare Parts",
        "description": "Start with SpareIQ import",
        "start_phase": "spare_parts",
    },
    "integrations": {
        "label": "I need Integrations",
        "description": "Start with External API setup",
        "start_phase": "external_api",
    },
    "from_scratch": {
        "label": "Start From Scratch",
        "description": "Complete guided onboarding",
        "start_phase": "company",
    },
}

VALID_ENTRY_PATHS = set(ENTRY_PATHS.keys())
VALID_PHASES = set(PHASE_ORDER)
