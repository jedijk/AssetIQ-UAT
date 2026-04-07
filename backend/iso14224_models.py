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

# Discipline categories - Unified across the application
class Discipline(str, Enum):
    MECHANICAL = "Mechanical"
    ELECTRICAL = "Electrical"
    INSTRUMENTATION = "Instrumentation"
    PROCESS = "Process"
    OPERATIONS = "Operations"
    MAINTENANCE = "Maintenance"
    SAFETY = "Safety"
    INSPECTION = "Inspection"
    RELIABILITY = "Reliability"
    ROTATING_EQUIPMENT = "Rotating Equipment"
    STATIC_EQUIPMENT = "Static Equipment"
    MULTI_DISCIPLINE = "Multi-discipline"

# Criticality levels
class CriticalityLevel(str, Enum):
    SAFETY_CRITICAL = "safety_critical"
    PRODUCTION_CRITICAL = "production_critical"
    MEDIUM = "medium"
    LOW = "low"

# Equipment categories for ISO 14224 classification
class EquipmentCategory(str, Enum):
    ROTATING = "rotating"
    STATIC = "static"
    CONTROL = "control"
    SAFETY = "safety"
    ELECTRICAL = "electrical"

# Standard system categories for compatibility mapping
SYSTEM_CATEGORIES = [
    "Pumping System",
    "Compression System",
    "Power Generation",
    "Power Distribution",
    "Cooling System",
    "Heating System",
    "Process Control",
    "Separation System",
    "Storage System",
    "Material Handling",
    "Safety System",
    "Fire Protection",
    "Utility System",
    "Extrusion System",
    "Mixing System",
]

# Equipment types with ISO classification - Expanded and standardized per ISO 14224
# Each type includes:
#   - compatible_systems: for smart filtering when creating equipment
#   - is_system_level: True for system-level equipment (DCS, ESD, SIS, F&G)
#   - applicable_levels: which ISO hierarchy levels this type can be used at
#     - "equipment_unit": main equipment (Level 4)
#     - "subunit": component of equipment (Level 5)
#     - "maintainable_item": replaceable part (Level 6)

EQUIPMENT_TYPES = [
    # ========== MECHANICAL - Rotating Equipment (Equipment Unit Level) ==========
    {"id": "pump_centrifugal", "name": "Centrifugal Pump", "iso_class": "1.1.1", "discipline": "Mechanical", "category": "rotating", "icon": "droplets", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Cooling System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "pump_reciprocating", "name": "Reciprocating Pump", "iso_class": "1.1.2", "discipline": "Mechanical", "category": "rotating", "icon": "droplets", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "pump_package", "name": "Pump Package / Skid", "iso_class": "1.1.3", "discipline": "Mechanical", "category": "rotating", "icon": "droplets", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "compressor_centrifugal", "name": "Centrifugal Compressor", "iso_class": "1.2.1", "discipline": "Mechanical", "category": "rotating", "icon": "wind", "default_failure_modes": [], "compatible_systems": ["Compression System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "compressor_reciprocating", "name": "Reciprocating Compressor", "iso_class": "1.2.2", "discipline": "Mechanical", "category": "rotating", "icon": "wind", "default_failure_modes": [], "compatible_systems": ["Compression System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "compressor_screw", "name": "Screw Compressor", "iso_class": "1.2.3", "discipline": "Mechanical", "category": "rotating", "icon": "wind", "default_failure_modes": [], "compatible_systems": ["Compression System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "turbine_gas", "name": "Gas Turbine", "iso_class": "1.3.1", "discipline": "Mechanical", "category": "rotating", "icon": "cog", "default_failure_modes": [], "compatible_systems": ["Power Generation", "Compression System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "turbine_steam", "name": "Steam Turbine", "iso_class": "1.3.2", "discipline": "Mechanical", "category": "rotating", "icon": "cog", "default_failure_modes": [], "compatible_systems": ["Power Generation"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "gearbox", "name": "Gearbox", "iso_class": "1.4.1", "discipline": "Mechanical", "category": "rotating", "icon": "cog", "default_failure_modes": [], "compatible_systems": ["Compression System", "Pumping System", "Power Generation", "Mixing System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "blower_fan", "name": "Blower / Fan", "iso_class": "1.5.1", "discipline": "Mechanical", "category": "rotating", "icon": "wind", "default_failure_modes": [], "compatible_systems": ["Cooling System", "Utility System", "Heating System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "mixer_agitator", "name": "Mixer / Agitator", "iso_class": "1.6.1", "discipline": "Mechanical", "category": "rotating", "icon": "settings", "default_failure_modes": [], "compatible_systems": ["Mixing System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "extruder", "name": "Extruder", "iso_class": "1.7.1", "discipline": "Mechanical", "category": "rotating", "icon": "cylinder", "default_failure_modes": [], "compatible_systems": ["Extrusion System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "grinder", "name": "Grinder", "iso_class": "1.8.1", "discipline": "Mechanical", "category": "rotating", "icon": "settings", "default_failure_modes": [], "compatible_systems": ["Material Handling", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "conveyor", "name": "Conveyor", "iso_class": "1.9.1", "discipline": "Mechanical", "category": "rotating", "icon": "move-horizontal", "default_failure_modes": [], "compatible_systems": ["Material Handling", "Extrusion System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "crane_hoist", "name": "Crane / Hoist", "iso_class": "1.10.1", "discipline": "Mechanical", "category": "rotating", "icon": "arrow-up-down", "default_failure_modes": [], "compatible_systems": ["Material Handling", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    
    # ========== MECHANICAL - Valves (Equipment Unit and Subunit Level) ==========
    {"id": "valve_manual", "name": "Manual Valve", "iso_class": "3.1.1", "discipline": "Mechanical", "category": "static", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Cooling System", "Heating System", "Process Control", "Storage System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "valve_check", "name": "Check Valve", "iso_class": "3.1.2", "discipline": "Mechanical", "category": "static", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Cooling System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "valve_ball", "name": "Ball Valve", "iso_class": "3.1.3", "discipline": "Mechanical", "category": "static", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Process Control", "Storage System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "valve_gate", "name": "Gate Valve", "iso_class": "3.1.4", "discipline": "Mechanical", "category": "static", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Storage System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "valve_butterfly", "name": "Butterfly Valve", "iso_class": "3.1.5", "discipline": "Mechanical", "category": "static", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Cooling System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    
    # ========== ELECTRICAL (Equipment Unit Level) ==========
    {"id": "motor_electric", "name": "Electric Motor", "iso_class": "4.1.1", "discipline": "Electrical", "category": "electrical", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Cooling System", "Material Handling", "Mixing System", "Extrusion System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "motor_dc", "name": "DC Motor", "iso_class": "4.1.2", "discipline": "Electrical", "category": "electrical", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Material Handling", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "transformer", "name": "Transformer", "iso_class": "4.2.1", "discipline": "Electrical", "category": "electrical", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Power Distribution"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "switchgear", "name": "Switchgear", "iso_class": "4.3.1", "discipline": "Electrical", "category": "electrical", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Power Distribution"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "mcc", "name": "Motor Control Center (MCC)", "iso_class": "4.3.2", "discipline": "Electrical", "category": "electrical", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Power Distribution"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "vfd", "name": "Variable Frequency Drive (VFD)", "iso_class": "4.4.1", "discipline": "Electrical", "category": "electrical", "icon": "activity", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Cooling System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "ups", "name": "UPS (Uninterruptible Power Supply)", "iso_class": "4.5.1", "discipline": "Electrical", "category": "electrical", "icon": "battery", "default_failure_modes": [], "compatible_systems": ["Power Distribution", "Safety System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "battery_system", "name": "Battery System", "iso_class": "4.5.2", "discipline": "Electrical", "category": "electrical", "icon": "battery", "default_failure_modes": [], "compatible_systems": ["Power Distribution", "Safety System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "generator", "name": "Generator", "iso_class": "4.6.1", "discipline": "Electrical", "category": "electrical", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Power Generation", "Power Distribution"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "cable_termination", "name": "Cable / Termination", "iso_class": "4.7.1", "discipline": "Electrical", "category": "electrical", "icon": "cable", "default_failure_modes": [], "compatible_systems": ["Power Distribution"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    
    # ========== INSTRUMENTATION (Equipment Unit and Subunit Level) ==========
    {"id": "sensor_pressure", "name": "Pressure Sensor / Transmitter", "iso_class": "5.1.1", "discipline": "Instrumentation", "category": "control", "icon": "gauge", "default_failure_modes": [], "compatible_systems": ["Process Control", "Pumping System", "Compression System", "Safety System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "sensor_temperature", "name": "Temperature Sensor / Transmitter", "iso_class": "5.1.2", "discipline": "Instrumentation", "category": "control", "icon": "thermometer", "default_failure_modes": [], "compatible_systems": ["Process Control", "Cooling System", "Heating System", "Safety System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "sensor_flow", "name": "Flow Sensor / Transmitter", "iso_class": "5.1.3", "discipline": "Instrumentation", "category": "control", "icon": "gauge", "default_failure_modes": [], "compatible_systems": ["Process Control", "Pumping System", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "sensor_level", "name": "Level Sensor / Transmitter", "iso_class": "5.1.4", "discipline": "Instrumentation", "category": "control", "icon": "gauge", "default_failure_modes": [], "compatible_systems": ["Process Control", "Storage System", "Separation System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "valve_control", "name": "Control Valve", "iso_class": "5.2.1", "discipline": "Instrumentation", "category": "control", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Process Control", "Pumping System", "Cooling System", "Heating System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "valve_positioner", "name": "Valve Positioner", "iso_class": "5.2.2", "discipline": "Instrumentation", "category": "control", "icon": "sliders", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "plc", "name": "PLC Controller", "iso_class": "5.3.1", "discipline": "Instrumentation", "category": "control", "icon": "cpu", "default_failure_modes": [], "compatible_systems": ["Process Control", "Safety System", "Material Handling"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "dcs", "name": "Distributed Control System (DCS)", "iso_class": "5.3.2", "discipline": "Instrumentation", "category": "control", "icon": "cpu", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": True, "applicable_levels": ["section_system", "equipment_unit"]},
    {"id": "analyzer_gas", "name": "Gas Analyzer", "iso_class": "5.4.1", "discipline": "Instrumentation", "category": "control", "icon": "flask-conical", "default_failure_modes": [], "compatible_systems": ["Process Control", "Safety System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "analyzer_chemical", "name": "Chemical Analyzer", "iso_class": "5.4.2", "discipline": "Instrumentation", "category": "control", "icon": "flask-conical", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "actuator_electric", "name": "Electric Actuator", "iso_class": "5.5.1", "discipline": "Instrumentation", "category": "control", "icon": "move", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "actuator_pneumatic", "name": "Pneumatic Actuator", "iso_class": "5.5.2", "discipline": "Instrumentation", "category": "control", "icon": "move", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    
    # ========== STATIC EQUIPMENT (Equipment Unit Level) ==========
    {"id": "heat_exchanger", "name": "Heat Exchanger", "iso_class": "2.1.1", "discipline": "Static Equipment", "category": "static", "icon": "thermometer", "default_failure_modes": [], "compatible_systems": ["Cooling System", "Heating System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "air_cooler", "name": "Air Cooler (Fin Fan)", "iso_class": "2.1.2", "discipline": "Static Equipment", "category": "static", "icon": "wind", "default_failure_modes": [], "compatible_systems": ["Cooling System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "vessel_pressure", "name": "Pressure Vessel", "iso_class": "2.2.1", "discipline": "Static Equipment", "category": "static", "icon": "box", "default_failure_modes": [], "compatible_systems": ["Separation System", "Process Control", "Storage System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "vessel_storage", "name": "Storage Tank", "iso_class": "2.2.2", "discipline": "Static Equipment", "category": "static", "icon": "box", "default_failure_modes": [], "compatible_systems": ["Storage System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "column_tower", "name": "Column / Tower", "iso_class": "2.3.1", "discipline": "Static Equipment", "category": "static", "icon": "cylinder", "default_failure_modes": [], "compatible_systems": ["Separation System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "reactor", "name": "Reactor", "iso_class": "2.4.1", "discipline": "Static Equipment", "category": "static", "icon": "flask-conical", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "filter_separator", "name": "Filter / Separator", "iso_class": "2.5.1", "discipline": "Static Equipment", "category": "static", "icon": "filter", "default_failure_modes": [], "compatible_systems": ["Separation System", "Utility System", "Pumping System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "pipe", "name": "Piping", "iso_class": "6.1.1", "discipline": "Static Equipment", "category": "static", "icon": "pipette", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Cooling System", "Heating System", "Process Control", "Storage System", "Utility System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "flange_fitting", "name": "Flange / Fitting", "iso_class": "6.1.2", "discipline": "Static Equipment", "category": "static", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Process Control", "Storage System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "boiler", "name": "Boiler", "iso_class": "2.6.1", "discipline": "Static Equipment", "category": "static", "icon": "flame", "default_failure_modes": [], "compatible_systems": ["Heating System", "Power Generation", "Utility System"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    {"id": "furnace_heater", "name": "Furnace / Heater", "iso_class": "2.6.2", "discipline": "Static Equipment", "category": "static", "icon": "flame", "default_failure_modes": [], "compatible_systems": ["Heating System", "Process Control"], "is_system_level": False, "applicable_levels": ["equipment_unit"]},
    
    # ========== SAFETY (System-level and Equipment Unit) ==========
    {"id": "valve_safety", "name": "Safety Valve / PSV", "iso_class": "7.1.1", "discipline": "Safety", "category": "safety", "icon": "shield", "default_failure_modes": [], "compatible_systems": ["Safety System", "Pumping System", "Compression System", "Storage System"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "rupture_disc", "name": "Rupture Disc", "iso_class": "7.1.2", "discipline": "Safety", "category": "safety", "icon": "shield", "default_failure_modes": [], "compatible_systems": ["Safety System", "Storage System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "esd", "name": "Emergency Shutdown System (ESD)", "iso_class": "7.2.1", "discipline": "Safety", "category": "safety", "icon": "shield-alert", "default_failure_modes": [], "compatible_systems": ["Safety System"], "is_system_level": True, "applicable_levels": ["section_system", "equipment_unit"]},
    {"id": "sis", "name": "Safety Instrumented System (SIS)", "iso_class": "7.2.2", "discipline": "Safety", "category": "safety", "icon": "shield-alert", "default_failure_modes": [], "compatible_systems": ["Safety System"], "is_system_level": True, "applicable_levels": ["section_system", "equipment_unit"]},
    {"id": "fire_gas", "name": "Fire & Gas System (F&G)", "iso_class": "7.3.1", "discipline": "Safety", "category": "safety", "icon": "flame", "default_failure_modes": [], "compatible_systems": ["Safety System", "Fire Protection"], "is_system_level": True, "applicable_levels": ["section_system", "equipment_unit"]},
    {"id": "fire_protection", "name": "Fire Protection / Deluge System", "iso_class": "7.3.2", "discipline": "Safety", "category": "safety", "icon": "droplets", "default_failure_modes": [], "compatible_systems": ["Fire Protection", "Safety System"], "is_system_level": True, "applicable_levels": ["section_system", "equipment_unit"]},
    {"id": "flare_system", "name": "Flare System", "iso_class": "7.4.1", "discipline": "Safety", "category": "safety", "icon": "flame", "default_failure_modes": [], "compatible_systems": ["Safety System"], "is_system_level": True, "applicable_levels": ["section_system", "equipment_unit"]},
    {"id": "gas_detector", "name": "Gas Detector", "iso_class": "7.5.1", "discipline": "Safety", "category": "safety", "icon": "alert-triangle", "default_failure_modes": [], "compatible_systems": ["Safety System", "Fire Protection"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    {"id": "flame_detector", "name": "Flame / Fire Detector", "iso_class": "7.5.2", "discipline": "Safety", "category": "safety", "icon": "alert-triangle", "default_failure_modes": [], "compatible_systems": ["Safety System", "Fire Protection"], "is_system_level": False, "applicable_levels": ["equipment_unit", "subunit"]},
    
    # ========== SUBUNIT-LEVEL COMPONENTS (Level 5) ==========
    {"id": "bearing_radial", "name": "Radial Bearing", "iso_class": "8.1.1", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation", "Mixing System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "bearing_thrust", "name": "Thrust Bearing", "iso_class": "8.1.2", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "bearing_journal", "name": "Journal Bearing", "iso_class": "8.1.3", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "seal_mechanical", "name": "Mechanical Seal", "iso_class": "8.2.1", "discipline": "Mechanical", "category": "component", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Mixing System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "seal_labyrinth", "name": "Labyrinth Seal", "iso_class": "8.2.2", "discipline": "Mechanical", "category": "component", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "seal_dry_gas", "name": "Dry Gas Seal", "iso_class": "8.2.3", "discipline": "Mechanical", "category": "component", "icon": "circle-dot", "default_failure_modes": [], "compatible_systems": ["Compression System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "coupling", "name": "Coupling", "iso_class": "8.3.1", "discipline": "Mechanical", "category": "component", "icon": "link", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation", "Mixing System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "impeller", "name": "Impeller", "iso_class": "8.4.1", "discipline": "Mechanical", "category": "component", "icon": "fan", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Mixing System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "rotor", "name": "Rotor", "iso_class": "8.4.2", "discipline": "Mechanical", "category": "component", "icon": "rotate-cw", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "stator", "name": "Stator", "iso_class": "8.4.3", "discipline": "Electrical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "shaft", "name": "Shaft", "iso_class": "8.5.1", "discipline": "Mechanical", "category": "component", "icon": "minus", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation", "Mixing System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "casing", "name": "Casing / Housing", "iso_class": "8.6.1", "discipline": "Mechanical", "category": "component", "icon": "box", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "diaphragm", "name": "Diaphragm", "iso_class": "8.7.1", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "piston", "name": "Piston", "iso_class": "8.7.2", "discipline": "Mechanical", "category": "component", "icon": "cylinder", "default_failure_modes": [], "compatible_systems": ["Compression System", "Pumping System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "cylinder_liner", "name": "Cylinder / Liner", "iso_class": "8.7.3", "discipline": "Mechanical", "category": "component", "icon": "cylinder", "default_failure_modes": [], "compatible_systems": ["Compression System", "Pumping System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "packing", "name": "Packing", "iso_class": "8.8.1", "discipline": "Mechanical", "category": "component", "icon": "layers", "default_failure_modes": [], "compatible_systems": ["Compression System", "Pumping System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "gasket", "name": "Gasket", "iso_class": "8.8.2", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Process Control", "Storage System"], "is_system_level": False, "applicable_levels": ["maintainable_item"]},
    {"id": "o_ring", "name": "O-Ring", "iso_class": "8.8.3", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Process Control"], "is_system_level": False, "applicable_levels": ["maintainable_item"]},
    {"id": "wear_ring", "name": "Wear Ring", "iso_class": "8.9.1", "discipline": "Mechanical", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Pumping System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "lubrication_system", "name": "Lubrication System", "iso_class": "8.10.1", "discipline": "Mechanical", "category": "auxiliary", "icon": "droplet", "default_failure_modes": [], "compatible_systems": ["Compression System", "Pumping System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "cooling_jacket", "name": "Cooling Jacket", "iso_class": "8.10.2", "discipline": "Mechanical", "category": "auxiliary", "icon": "thermometer", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "screw_element", "name": "Screw Element", "iso_class": "8.11.1", "discipline": "Mechanical", "category": "component", "icon": "settings", "default_failure_modes": [], "compatible_systems": ["Extrusion System", "Compression System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "barrel_section", "name": "Barrel Section", "iso_class": "8.11.2", "discipline": "Mechanical", "category": "component", "icon": "cylinder", "default_failure_modes": [], "compatible_systems": ["Extrusion System"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "die_head", "name": "Die / Die Head", "iso_class": "8.11.3", "discipline": "Mechanical", "category": "component", "icon": "square", "default_failure_modes": [], "compatible_systems": ["Extrusion System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "heating_element", "name": "Heating Element", "iso_class": "8.12.1", "discipline": "Electrical", "category": "component", "icon": "flame", "default_failure_modes": [], "compatible_systems": ["Heating System", "Extrusion System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "cooling_coil", "name": "Cooling Coil", "iso_class": "8.12.2", "discipline": "Mechanical", "category": "component", "icon": "thermometer", "default_failure_modes": [], "compatible_systems": ["Cooling System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "tube_bundle", "name": "Tube Bundle", "iso_class": "8.13.1", "discipline": "Static Equipment", "category": "component", "icon": "grip", "default_failure_modes": [], "compatible_systems": ["Cooling System", "Heating System"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "baffle_plate", "name": "Baffle Plate", "iso_class": "8.13.2", "discipline": "Static Equipment", "category": "component", "icon": "square", "default_failure_modes": [], "compatible_systems": ["Cooling System", "Heating System", "Separation System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "internals", "name": "Vessel Internals", "iso_class": "8.14.1", "discipline": "Static Equipment", "category": "component", "icon": "layers", "default_failure_modes": [], "compatible_systems": ["Separation System", "Storage System"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "tray_packing", "name": "Tray / Column Packing", "iso_class": "8.14.2", "discipline": "Static Equipment", "category": "component", "icon": "layers", "default_failure_modes": [], "compatible_systems": ["Separation System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "belt_drive", "name": "Belt / Drive Belt", "iso_class": "8.15.1", "discipline": "Mechanical", "category": "component", "icon": "rotate-cw", "default_failure_modes": [], "compatible_systems": ["Material Handling", "Cooling System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "chain_sprocket", "name": "Chain / Sprocket", "iso_class": "8.15.2", "discipline": "Mechanical", "category": "component", "icon": "settings", "default_failure_modes": [], "compatible_systems": ["Material Handling"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "gear_set", "name": "Gear Set", "iso_class": "8.16.1", "discipline": "Mechanical", "category": "component", "icon": "cog", "default_failure_modes": [], "compatible_systems": ["Compression System", "Pumping System", "Power Generation", "Mixing System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "winding", "name": "Winding (Motor/Generator)", "iso_class": "8.17.1", "discipline": "Electrical", "category": "component", "icon": "rotate-cw", "default_failure_modes": [], "compatible_systems": ["Pumping System", "Compression System", "Power Generation"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "brush_commutator", "name": "Brush / Commutator", "iso_class": "8.17.2", "discipline": "Electrical", "category": "component", "icon": "minus", "default_failure_modes": [], "compatible_systems": ["Power Generation", "Material Handling"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "contactor_relay", "name": "Contactor / Relay", "iso_class": "8.18.1", "discipline": "Electrical", "category": "component", "icon": "square", "default_failure_modes": [], "compatible_systems": ["Power Distribution", "Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "circuit_breaker", "name": "Circuit Breaker", "iso_class": "8.18.2", "discipline": "Electrical", "category": "component", "icon": "zap-off", "default_failure_modes": [], "compatible_systems": ["Power Distribution"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "fuse", "name": "Fuse", "iso_class": "8.18.3", "discipline": "Electrical", "category": "component", "icon": "minus", "default_failure_modes": [], "compatible_systems": ["Power Distribution"], "is_system_level": False, "applicable_levels": ["maintainable_item"]},
    {"id": "capacitor", "name": "Capacitor", "iso_class": "8.19.1", "discipline": "Electrical", "category": "component", "icon": "battery", "default_failure_modes": [], "compatible_systems": ["Power Distribution", "Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "resistor", "name": "Resistor", "iso_class": "8.19.2", "discipline": "Electrical", "category": "component", "icon": "minus", "default_failure_modes": [], "compatible_systems": ["Power Distribution", "Process Control"], "is_system_level": False, "applicable_levels": ["maintainable_item"]},
    {"id": "power_supply_unit", "name": "Power Supply Unit", "iso_class": "8.20.1", "discipline": "Electrical", "category": "component", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Process Control", "Power Distribution"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "io_module", "name": "I/O Module", "iso_class": "8.21.1", "discipline": "Instrumentation", "category": "component", "icon": "cpu", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "communication_module", "name": "Communication Module", "iso_class": "8.21.2", "discipline": "Instrumentation", "category": "component", "icon": "wifi", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "hmi_panel", "name": "HMI Panel", "iso_class": "8.22.1", "discipline": "Instrumentation", "category": "component", "icon": "monitor", "default_failure_modes": [], "compatible_systems": ["Process Control"], "is_system_level": False, "applicable_levels": ["subunit"]},
    {"id": "solenoid_valve", "name": "Solenoid Valve", "iso_class": "8.23.1", "discipline": "Instrumentation", "category": "component", "icon": "zap", "default_failure_modes": [], "compatible_systems": ["Process Control", "Safety System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "limit_switch", "name": "Limit Switch", "iso_class": "8.23.2", "discipline": "Instrumentation", "category": "component", "icon": "toggle-left", "default_failure_modes": [], "compatible_systems": ["Process Control", "Safety System", "Material Handling"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "thermocouple", "name": "Thermocouple", "iso_class": "8.24.1", "discipline": "Instrumentation", "category": "component", "icon": "thermometer", "default_failure_modes": [], "compatible_systems": ["Process Control", "Heating System", "Cooling System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "rtd", "name": "RTD (Resistance Temperature Detector)", "iso_class": "8.24.2", "discipline": "Instrumentation", "category": "component", "icon": "thermometer", "default_failure_modes": [], "compatible_systems": ["Process Control", "Heating System", "Cooling System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "orifice_plate", "name": "Orifice Plate", "iso_class": "8.25.1", "discipline": "Instrumentation", "category": "component", "icon": "circle", "default_failure_modes": [], "compatible_systems": ["Process Control", "Pumping System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "pressure_gauge", "name": "Pressure Gauge (Local)", "iso_class": "8.25.2", "discipline": "Instrumentation", "category": "component", "icon": "gauge", "default_failure_modes": [], "compatible_systems": ["Process Control", "Pumping System", "Compression System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
    {"id": "sight_glass", "name": "Sight Glass", "iso_class": "8.26.1", "discipline": "Instrumentation", "category": "component", "icon": "eye", "default_failure_modes": [], "compatible_systems": ["Process Control", "Storage System"], "is_system_level": False, "applicable_levels": ["subunit", "maintainable_item"]},
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
    discipline: str = "Mechanical"
    icon: str = "cog"
    category: Optional[str] = "rotating"  # rotating, static, control, safety, electrical, component, auxiliary
    default_failure_modes: Optional[List[str]] = []  # List of failure mode IDs
    compatible_systems: Optional[List[str]] = []  # List of compatible system categories
    is_system_level: Optional[bool] = False  # True for DCS, ESD, SIS, F&G, etc.
    applicable_levels: Optional[List[str]] = ["equipment_unit"]  # ISO levels where this type can be used

class EquipmentTypeUpdate(BaseModel):
    name: Optional[str] = None
    iso_class: Optional[str] = None
    discipline: Optional[str] = None
    icon: Optional[str] = None
    category: Optional[str] = None
    default_failure_modes: Optional[List[str]] = None
    compatible_systems: Optional[List[str]] = None
    is_system_level: Optional[bool] = None
    applicable_levels: Optional[List[str]] = None  # ISO levels where this type can be used

# Equipment type detection keywords - Expanded for ISO 14224 coverage
EQUIPMENT_TYPE_KEYWORDS = {
    # Pumps
    "pump": "pump_centrifugal",
    "centrifugal pump": "pump_centrifugal",
    "reciprocating pump": "pump_reciprocating",
    "pump skid": "pump_package",
    "pump package": "pump_package",
    
    # Compressors
    "compressor": "compressor_centrifugal",
    "centrifugal compressor": "compressor_centrifugal",
    "reciprocating compressor": "compressor_reciprocating",
    "screw compressor": "compressor_screw",
    
    # Turbines
    "turbine": "turbine_gas",
    "gas turbine": "turbine_gas",
    "steam turbine": "turbine_steam",
    
    # Mechanical
    "gearbox": "gearbox",
    "gear box": "gearbox",
    "blower": "blower_fan",
    "fan": "blower_fan",
    "mixer": "mixer_agitator",
    "agitator": "mixer_agitator",
    "extruder": "extruder",
    "grinder": "grinder",
    "conveyor": "conveyor",
    "crane": "crane_hoist",
    "hoist": "crane_hoist",
    
    # Valves
    "control valve": "valve_control",
    "safety valve": "valve_safety",
    "relief valve": "valve_safety",
    "psv": "valve_safety",
    "manual valve": "valve_manual",
    "check valve": "valve_check",
    "ball valve": "valve_ball",
    "gate valve": "valve_gate",
    "butterfly valve": "valve_butterfly",
    "valve": "valve_control",
    
    # Electrical
    "motor": "motor_electric",
    "electric motor": "motor_electric",
    "dc motor": "motor_dc",
    "transformer": "transformer",
    "switchgear": "switchgear",
    "mcc": "mcc",
    "motor control center": "mcc",
    "vfd": "vfd",
    "variable frequency drive": "vfd",
    "ups": "ups",
    "uninterruptible power": "ups",
    "battery": "battery_system",
    "generator": "generator",
    
    # Instrumentation
    "sensor": "sensor_pressure",
    "pressure sensor": "sensor_pressure",
    "pressure transmitter": "sensor_pressure",
    "temperature sensor": "sensor_temperature",
    "temperature transmitter": "sensor_temperature",
    "flow sensor": "sensor_flow",
    "flow transmitter": "sensor_flow",
    "level sensor": "sensor_level",
    "level transmitter": "sensor_level",
    "transmitter": "sensor_pressure",
    "positioner": "valve_positioner",
    "valve positioner": "valve_positioner",
    "plc": "plc",
    "controller": "plc",
    "dcs": "dcs",
    "analyzer": "analyzer_gas",
    "gas analyzer": "analyzer_gas",
    "actuator": "actuator_electric",
    "electric actuator": "actuator_electric",
    "pneumatic actuator": "actuator_pneumatic",
    
    # Static Equipment
    "heat exchanger": "heat_exchanger",
    "exchanger": "heat_exchanger",
    "hx": "heat_exchanger",
    "air cooler": "air_cooler",
    "fin fan": "air_cooler",
    "vessel": "vessel_pressure",
    "pressure vessel": "vessel_pressure",
    "tank": "vessel_storage",
    "storage tank": "vessel_storage",
    "column": "column_tower",
    "tower": "column_tower",
    "reactor": "reactor",
    "filter": "filter_separator",
    "separator": "filter_separator",
    "pipe": "pipe",
    "piping": "pipe",
    "flange": "flange_fitting",
    "boiler": "boiler",
    "furnace": "furnace_heater",
    "heater": "furnace_heater",
    
    # Safety
    "esd": "esd",
    "emergency shutdown": "esd",
    "sis": "sis",
    "safety instrumented": "sis",
    "fire gas": "fire_gas",
    "f&g": "fire_gas",
    "fire protection": "fire_protection",
    "deluge": "fire_protection",
    "flare": "flare_system",
    "gas detector": "gas_detector",
    "flame detector": "flame_detector",
    "fire detector": "flame_detector",
    "rupture disc": "rupture_disc",
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

