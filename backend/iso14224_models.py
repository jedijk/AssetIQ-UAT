# ISO 14224 Equipment Hierarchy Models

from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class ISOLevel(str, Enum):
    """ISO 14224 Taxonomy Levels"""
    INSTALLATION = "installation"       # Level 1: Offshore platform, Onshore plant
    PLANT_UNIT = "plant_unit"          # Level 2: Production unit, Utility unit
    SECTION_SYSTEM = "section_system"  # Level 3: Gas compression, Water injection
    EQUIPMENT_UNIT = "equipment_unit"  # Level 4: Compressor, Pump, Heat exchanger
    SUBUNIT = "subunit"                # Level 5: Driver, Driven unit, Control system
    MAINTAINABLE_ITEM = "maintainable_item"  # Level 6: Bearing, Seal, Impeller
    # Legacy levels for backward compatibility
    UNIT = "unit"                      # Maps to PLANT_UNIT
    SYSTEM = "system"                  # Maps to SECTION_SYSTEM
    EQUIPMENT = "equipment"            # Maps to EQUIPMENT_UNIT

# ISO 14224 Level hierarchy order (parent -> child relationships)
ISO_LEVEL_ORDER = [
    ISOLevel.INSTALLATION,
    ISOLevel.PLANT_UNIT,
    ISOLevel.SECTION_SYSTEM,
    ISOLevel.EQUIPMENT_UNIT,
    ISOLevel.SUBUNIT,
    ISOLevel.MAINTAINABLE_ITEM
]

# Legacy level mapping to ISO 14224 standard
LEGACY_LEVEL_MAP = {
    "unit": "plant_unit",
    "system": "section_system",
    "equipment": "equipment_unit"
}

# Display labels for ISO 14224 levels
ISO_LEVEL_LABELS = {
    ISOLevel.INSTALLATION: "Installation",
    ISOLevel.PLANT_UNIT: "Plant/Unit",
    ISOLevel.SECTION_SYSTEM: "Section/System",
    ISOLevel.EQUIPMENT_UNIT: "Equipment Unit",
    ISOLevel.SUBUNIT: "Subunit",
    ISOLevel.MAINTAINABLE_ITEM: "Maintainable Item",
    # Legacy level labels
    ISOLevel.UNIT: "Plant/Unit",
    ISOLevel.SYSTEM: "Section/System",
    ISOLevel.EQUIPMENT: "Equipment Unit"
}

def normalize_level(level: ISOLevel) -> ISOLevel:
    """Normalize legacy levels to ISO 14224 standard."""
    if level == ISOLevel.UNIT:
        return ISOLevel.PLANT_UNIT
    if level == ISOLevel.SYSTEM:
        return ISOLevel.SECTION_SYSTEM
    if level == ISOLevel.EQUIPMENT:
        return ISOLevel.EQUIPMENT_UNIT
    return level

def get_valid_parent_level(level: ISOLevel) -> Optional[ISOLevel]:
    """Get the valid parent level for a given ISO level."""
    norm_level = normalize_level(level)
    try:
        idx = ISO_LEVEL_ORDER.index(norm_level)
    except ValueError:
        return None
    if idx == 0:
        return None  # Installation has no parent
    return ISO_LEVEL_ORDER[idx - 1]

def get_valid_child_levels(level: ISOLevel) -> List[ISOLevel]:
    """Get valid child levels for a given ISO level."""
    norm_level = normalize_level(level)
    try:
        idx = ISO_LEVEL_ORDER.index(norm_level)
    except ValueError:
        return []
    if idx == len(ISO_LEVEL_ORDER) - 1:
        return []  # Maintainable item has no children
    return [ISO_LEVEL_ORDER[idx + 1]]

def is_valid_parent_child(parent_level: ISOLevel, child_level: ISOLevel) -> bool:
    """Check if parent-child relationship is valid per ISO 14224."""
    norm_parent = normalize_level(parent_level)
    norm_child = normalize_level(child_level)
    valid_parent = get_valid_parent_level(norm_child)
    return valid_parent == norm_parent

# Discipline categories
class Discipline(str, Enum):
    MECHANICAL = "mechanical"
    ELECTRICAL = "electrical"
    INSTRUMENTATION = "instrumentation"
    PROCESS = "process"

# Criticality levels
class CriticalityLevel(str, Enum):
    SAFETY_CRITICAL = "safety_critical"
    PRODUCTION_CRITICAL = "production_critical"
    MEDIUM = "medium"
    LOW = "low"

# Equipment types with ISO classification
EQUIPMENT_TYPES = [
    {"id": "pump_centrifugal", "name": "Centrifugal Pump", "iso_class": "1.1.1", "discipline": "mechanical", "icon": "droplets"},
    {"id": "pump_reciprocating", "name": "Reciprocating Pump", "iso_class": "1.1.2", "discipline": "mechanical", "icon": "droplets"},
    {"id": "compressor_centrifugal", "name": "Centrifugal Compressor", "iso_class": "1.2.1", "discipline": "mechanical", "icon": "wind"},
    {"id": "compressor_reciprocating", "name": "Reciprocating Compressor", "iso_class": "1.2.2", "discipline": "mechanical", "icon": "wind"},
    {"id": "turbine_gas", "name": "Gas Turbine", "iso_class": "1.3.1", "discipline": "mechanical", "icon": "cog"},
    {"id": "turbine_steam", "name": "Steam Turbine", "iso_class": "1.3.2", "discipline": "mechanical", "icon": "cog"},
    {"id": "extruder", "name": "Extruder", "iso_class": "1.4.1", "discipline": "mechanical", "icon": "cylinder"},
    {"id": "heat_exchanger", "name": "Heat Exchanger", "iso_class": "2.1.1", "discipline": "process", "icon": "thermometer"},
    {"id": "vessel_pressure", "name": "Pressure Vessel", "iso_class": "2.2.1", "discipline": "process", "icon": "box"},
    {"id": "vessel_storage", "name": "Storage Tank", "iso_class": "2.2.2", "discipline": "process", "icon": "box"},
    {"id": "valve_control", "name": "Control Valve", "iso_class": "3.1.1", "discipline": "instrumentation", "icon": "circle-dot"},
    {"id": "valve_safety", "name": "Safety Valve", "iso_class": "3.1.2", "discipline": "mechanical", "icon": "circle-dot"},
    {"id": "valve_manual", "name": "Manual Valve", "iso_class": "3.1.3", "discipline": "mechanical", "icon": "circle-dot"},
    {"id": "motor_electric", "name": "Electric Motor", "iso_class": "4.1.1", "discipline": "electrical", "icon": "zap"},
    {"id": "transformer", "name": "Transformer", "iso_class": "4.2.1", "discipline": "electrical", "icon": "zap"},
    {"id": "switchgear", "name": "Switchgear", "iso_class": "4.3.1", "discipline": "electrical", "icon": "zap"},
    {"id": "sensor_pressure", "name": "Pressure Sensor", "iso_class": "5.1.1", "discipline": "instrumentation", "icon": "gauge"},
    {"id": "sensor_temperature", "name": "Temperature Sensor", "iso_class": "5.1.2", "discipline": "instrumentation", "icon": "gauge"},
    {"id": "sensor_flow", "name": "Flow Sensor", "iso_class": "5.1.3", "discipline": "instrumentation", "icon": "gauge"},
    {"id": "plc", "name": "PLC Controller", "iso_class": "5.2.1", "discipline": "instrumentation", "icon": "cpu"},
    {"id": "pipe", "name": "Piping", "iso_class": "6.1.1", "discipline": "mechanical", "icon": "pipette"},
    {"id": "grinder", "name": "Grinder", "iso_class": "1.5.1", "discipline": "mechanical", "icon": "settings"},
]

# Default criticality profiles
CRITICALITY_PROFILES = [
    {
        "id": "safety_critical",
        "name": "Safety Critical",
        "level": "safety_critical",
        "color": "#EF4444",
        "defaults": {
            "fatality_risk": 0.1,
            "production_loss_per_day": 100000,
            "failure_probability": 0.01,
            "downtime_days": 7
        }
    },
    {
        "id": "production_critical",
        "name": "Production Critical",
        "level": "production_critical",
        "color": "#F97316",
        "defaults": {
            "fatality_risk": 0.001,
            "production_loss_per_day": 500000,
            "failure_probability": 0.05,
            "downtime_days": 3
        }
    },
    {
        "id": "medium",
        "name": "Medium Impact",
        "level": "medium",
        "color": "#EAB308",
        "defaults": {
            "fatality_risk": 0.0001,
            "production_loss_per_day": 50000,
            "failure_probability": 0.1,
            "downtime_days": 1
        }
    },
    {
        "id": "low",
        "name": "Low Impact",
        "level": "low",
        "color": "#22C55E",
        "defaults": {
            "fatality_risk": 0,
            "production_loss_per_day": 10000,
            "failure_probability": 0.2,
            "downtime_days": 0.5
        }
    }
]

# Pydantic models for API

class EquipmentNodeCreate(BaseModel):
    name: str
    level: ISOLevel
    parent_id: Optional[str] = None
    equipment_type_id: Optional[str] = None
    description: Optional[str] = None
    process_step: Optional[str] = None  # Process step mapping (editable at subunit and maintainable_item levels)

class EquipmentNodeUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    equipment_type_id: Optional[str] = None
    description: Optional[str] = None
    process_step: Optional[str] = None  # Process step mapping

class CriticalityAssignment(BaseModel):
    profile_id: Optional[str] = None
    # Four criticality dimensions (1-5 scale each)
    safety_impact: Optional[int] = None  # Safety impact (1-5)
    production_impact: Optional[int] = None  # Production impact (1-5)
    environmental_impact: Optional[int] = None  # Environmental impact (1-5)
    reputation_impact: Optional[int] = None  # Reputation impact (1-5)
    # Legacy fields for backwards compatibility
    fatality_risk: Optional[float] = None
    production_loss_per_day: Optional[float] = None
    failure_probability: Optional[float] = None
    downtime_days: Optional[float] = None

class MoveNodeRequest(BaseModel):
    node_id: str
    new_parent_id: str
    recalculate_criticality: bool = True

class UnstructuredItemCreate(BaseModel):
    name: str
    detected_type_id: Optional[str] = None
    detected_discipline: Optional[str] = None
    source: Optional[str] = None  # "chat", "file", "paste"

class ParseEquipmentListRequest(BaseModel):
    content: str
    source: str = "paste"  # "paste", "chat", "file"

class AssignToHierarchyRequest(BaseModel):
    parent_id: str
    level: str  # ISO level to assign

class EquipmentTypeCreate(BaseModel):
    id: str
    name: str
    iso_class: Optional[str] = None
    discipline: str = "mechanical"
    icon: str = "cog"

class EquipmentTypeUpdate(BaseModel):
    name: Optional[str] = None
    iso_class: Optional[str] = None
    discipline: Optional[str] = None
    icon: Optional[str] = None

# Equipment type detection keywords
EQUIPMENT_TYPE_KEYWORDS = {
    "pump": "pump_centrifugal",
    "centrifugal pump": "pump_centrifugal",
    "reciprocating pump": "pump_reciprocating",
    "compressor": "compressor_centrifugal",
    "centrifugal compressor": "compressor_centrifugal",
    "reciprocating compressor": "compressor_reciprocating",
    "turbine": "turbine_gas",
    "gas turbine": "turbine_gas",
    "steam turbine": "turbine_steam",
    "heat exchanger": "heat_exchanger",
    "exchanger": "heat_exchanger",
    "hx": "heat_exchanger",
    "vessel": "vessel_pressure",
    "pressure vessel": "vessel_pressure",
    "tank": "vessel_storage",
    "storage tank": "vessel_storage",
    "valve": "valve_control",
    "control valve": "valve_control",
    "safety valve": "valve_safety",
    "relief valve": "valve_safety",
    "motor": "motor_electric",
    "electric motor": "motor_electric",
    "transformer": "transformer",
    "switchgear": "switchgear",
    "sensor": "sensor_pressure",
    "pressure sensor": "sensor_pressure",
    "temperature sensor": "sensor_temperature",
    "flow sensor": "sensor_flow",
    "transmitter": "sensor_pressure",
    "plc": "plc",
    "controller": "plc",
    "pipe": "pipe",
    "piping": "pipe",
}

def detect_equipment_type(name: str) -> Optional[dict]:
    """Detect equipment type from name using keywords."""
    name_lower = name.lower()
    
    # Check for tag patterns like P-101, C-201, HX-301, etc.
    import re
    tag_patterns = {
        r'\bp[-_]?\d': "pump_centrifugal",
        r'\bc[-_]?\d': "compressor_centrifugal",
        r'\bhx[-_]?\d': "heat_exchanger",
        r'\be[-_]?\d': "heat_exchanger",
        r'\bv[-_]?\d': "vessel_pressure",
        r'\bt[-_]?\d': "vessel_storage",
        r'\bfv[-_]?\d': "valve_control",
        r'\bpv[-_]?\d': "valve_control",
        r'\bsv[-_]?\d': "valve_safety",
        r'\bpsv[-_]?\d': "valve_safety",
        r'\bm[-_]?\d': "motor_electric",
        r'\bpt[-_]?\d': "sensor_pressure",
        r'\btt[-_]?\d': "sensor_temperature",
        r'\bft[-_]?\d': "sensor_flow",
    }
    
    for pattern, type_id in tag_patterns.items():
        if re.search(pattern, name_lower):
            equip_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
            if equip_type:
                return equip_type
    
    # Check keywords (longer matches first)
    for keyword in sorted(EQUIPMENT_TYPE_KEYWORDS.keys(), key=len, reverse=True):
        if keyword in name_lower:
            type_id = EQUIPMENT_TYPE_KEYWORDS[keyword]
            equip_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
            if equip_type:
                return equip_type
    
    return None

