"""
Unified Discipline Constants
Used across the application for consistency in Actions, Tasks, AI Recommendations, and FMEA.
"""

from enum import Enum


class UnifiedDiscipline(str, Enum):
    """
    Unified discipline categories used across the application.
    Aligned across:
    - Equipment hierarchy (ISO 14224)
    - Task management
    - AI recommendations
    - Action tracking
    - FMEA library
    """
    # Core Engineering Disciplines
    MECHANICAL = "Mechanical"
    ELECTRICAL = "Electrical"
    INSTRUMENTATION = "Instrumentation"
    PROCESS = "Process"
    
    # Operational Disciplines
    OPERATIONS = "Operations"
    MAINTENANCE = "Maintenance"
    
    # Safety & Quality
    SAFETY = "Safety"
    INSPECTION = "Inspection"
    
    # Specialized
    RELIABILITY = "Reliability"
    ROTATING_EQUIPMENT = "Rotating Equipment"
    STATIC_EQUIPMENT = "Static Equipment"
    MULTI_DISCIPLINE = "Multi-discipline"


# List of all discipline values for dropdowns
DISCIPLINE_LIST = [d.value for d in UnifiedDiscipline]

# Mapping from legacy values to unified values
DISCIPLINE_MAPPING = {
    # Lowercase variants
    "mechanical": UnifiedDiscipline.MECHANICAL.value,
    "electrical": UnifiedDiscipline.ELECTRICAL.value,
    "instrumentation": UnifiedDiscipline.INSTRUMENTATION.value,
    "process": UnifiedDiscipline.PROCESS.value,
    "operations": UnifiedDiscipline.OPERATIONS.value,
    "maintenance": UnifiedDiscipline.MAINTENANCE.value,
    "safety": UnifiedDiscipline.SAFETY.value,
    "inspection": UnifiedDiscipline.INSPECTION.value,
    "reliability": UnifiedDiscipline.RELIABILITY.value,
    "rotating_equipment": UnifiedDiscipline.ROTATING_EQUIPMENT.value,
    "static_equipment": UnifiedDiscipline.STATIC_EQUIPMENT.value,
    "multi-discipline": UnifiedDiscipline.MULTI_DISCIPLINE.value,
    "multi_discipline": UnifiedDiscipline.MULTI_DISCIPLINE.value,
    # Legacy task disciplines
    "lab": UnifiedDiscipline.INSPECTION.value,
    "laboratory": UnifiedDiscipline.INSPECTION.value,
    "engineering": UnifiedDiscipline.RELIABILITY.value,
    # Piping maps to Static Equipment
    "piping": UnifiedDiscipline.STATIC_EQUIPMENT.value,
    "Piping": UnifiedDiscipline.STATIC_EQUIPMENT.value,
    # Abbreviations - Operations
    "ops": UnifiedDiscipline.OPERATIONS.value,
    "op": UnifiedDiscipline.OPERATIONS.value,  # Common Dutch abbreviation
    "oper": UnifiedDiscipline.OPERATIONS.value,
    "bediening": UnifiedDiscipline.OPERATIONS.value,  # Dutch for Operations
    # Abbreviations - Mechanical
    "mech": UnifiedDiscipline.MECHANICAL.value,
    "td": UnifiedDiscipline.MECHANICAL.value,  # Technical Department -> Mechanical
    "tech": UnifiedDiscipline.MECHANICAL.value,
    "technisch": UnifiedDiscipline.MECHANICAL.value,  # Dutch for Technical
    "werktuigbouw": UnifiedDiscipline.MECHANICAL.value,  # Dutch for Mechanical Engineering
    # Abbreviations - Electrical
    "elec": UnifiedDiscipline.ELECTRICAL.value,
    "elektro": UnifiedDiscipline.ELECTRICAL.value,  # Dutch for Electrical
    "e&i": UnifiedDiscipline.ELECTRICAL.value,
    # Abbreviations - Instrumentation
    "inst": UnifiedDiscipline.INSTRUMENTATION.value,
    "instr": UnifiedDiscipline.INSTRUMENTATION.value,
    "i&c": UnifiedDiscipline.INSTRUMENTATION.value,
    # Abbreviations - Maintenance
    "maint": UnifiedDiscipline.MAINTENANCE.value,
    "onderhoud": UnifiedDiscipline.MAINTENANCE.value,  # Dutch for Maintenance
}


def normalize_discipline(value: str) -> str:
    """
    Normalize a discipline value to the unified format.
    Returns the input value if already valid, or maps legacy values.
    """
    if not value:
        return ""
    
    # Check if already a valid unified discipline
    if value in DISCIPLINE_LIST:
        return value
    
    # Try mapping
    mapped = DISCIPLINE_MAPPING.get(value.lower().replace(" ", "_"))
    if mapped:
        return mapped
    
    # Return title-cased version as fallback
    return value.title()
