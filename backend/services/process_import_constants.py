"""Process import — ISO 14224 constants and equipment templates."""
import re

# ISO 14224 Level definitions
ISO_LEVELS = [
    "Plant/Unit",
    "Section/System",
    "Equipment Unit",
    "Subunit",
    "Maintainable Item"
]

# Equipment type patterns (common industrial tag prefixes)
EQUIPMENT_TYPE_PATTERNS = {
    "P": {"type": "Pump", "template": "pump"},
    "C": {"type": "Compressor", "template": "compressor"},
    "T": {"type": "Tank", "template": "tank"},
    "V": {"type": "Vessel", "template": "vessel"},
    "E": {"type": "Heat Exchanger", "template": "exchanger"},
    "F": {"type": "Filter", "template": "filter"},
    "R": {"type": "Reactor/Extruder", "template": "extruder"},
    "X": {"type": "Miscellaneous", "template": None},
    "M": {"type": "Motor", "template": "motor"},
    "G": {"type": "Generator", "template": "generator"},
    "K": {"type": "Compressor", "template": "compressor"},
    "B": {"type": "Blower/Fan", "template": "fan"},
    "H": {"type": "Heater", "template": "heater"},
    "D": {"type": "Drum/Vessel", "template": "vessel"},
    "A": {"type": "Analyzer", "template": "instrument"},
    "FI": {"type": "Flow Indicator", "template": "instrument"},
    "PI": {"type": "Pressure Indicator", "template": "instrument"},
    "TI": {"type": "Temperature Indicator", "template": "instrument"},
    "LI": {"type": "Level Indicator", "template": "instrument"},
    "CV": {"type": "Control Valve", "template": "valve"},
}

# Equipment templates for auto-generating subunits/maintainable items
EQUIPMENT_TEMPLATES = {
    "pump": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "CPL", "name": "Coupling", "type": "Coupling"},
            {"suffix": "IMP", "name": "Impeller Section", "type": "Impeller"},
            {"suffix": "SEAL", "name": "Seal Section", "type": "Seal"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Drive End Bearing", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Non-Drive End Bearing", "type": "Bearing"},
            {"suffix": "SEAL01", "name": "Mechanical Seal", "type": "Seal"},
        ]
    },
    "extruder": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "GB01", "name": "Gearbox", "type": "Gearbox"},
            {"suffix": "SCR", "name": "Screw Section", "type": "Screw"},
            {"suffix": "HTR", "name": "Heating Section", "type": "Heater"},
            {"suffix": "CLR", "name": "Cooling Section", "type": "Cooler"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Motor Bearing DE", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Motor Bearing NDE", "type": "Bearing"},
            {"suffix": "SEAL01", "name": "Gearbox Seal", "type": "Seal"},
            {"suffix": "THRST", "name": "Thrust Bearing", "type": "Bearing"},
        ]
    },
    "compressor": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "GB01", "name": "Gearbox", "type": "Gearbox"},
            {"suffix": "STG01", "name": "Compression Stage 1", "type": "Stage"},
            {"suffix": "CLR01", "name": "Intercooler", "type": "Cooler"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Drive Bearing", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Support Bearing", "type": "Bearing"},
            {"suffix": "SEAL01", "name": "Shaft Seal", "type": "Seal"},
            {"suffix": "VLV01", "name": "Inlet Valve", "type": "Valve"},
        ]
    },
    "conveyor": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "GB01", "name": "Gearbox", "type": "Gearbox"},
            {"suffix": "DRV", "name": "Drive Assembly", "type": "Drive"},
            {"suffix": "BELT", "name": "Conveying Element", "type": "Belt"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Head Pulley Bearing", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Tail Pulley Bearing", "type": "Bearing"},
            {"suffix": "TENS", "name": "Belt Tensioner", "type": "Tensioner"},
        ]
    },
    "filter": {
        "subunits": [
            {"suffix": "BODY", "name": "Filter Body", "type": "Vessel"},
            {"suffix": "SCR", "name": "Screen/Element", "type": "Screen"},
            {"suffix": "DRV", "name": "Drive (if rotary)", "type": "Drive"},
        ],
        "maintainable_items": [
            {"suffix": "ELEM", "name": "Filter Element", "type": "Element"},
            {"suffix": "GSKT", "name": "Body Gasket", "type": "Gasket"},
        ]
    },
    "exchanger": {
        "subunits": [
            {"suffix": "SHELL", "name": "Shell Side", "type": "Shell"},
            {"suffix": "TUBE", "name": "Tube Bundle", "type": "Tubes"},
        ],
        "maintainable_items": [
            {"suffix": "GSKT01", "name": "Channel Gasket", "type": "Gasket"},
            {"suffix": "GSKT02", "name": "Shell Gasket", "type": "Gasket"},
            {"suffix": "TUBE01", "name": "Tube Bundle", "type": "Tubes"},
        ]
    },
    "tank": {
        "subunits": [
            {"suffix": "BODY", "name": "Tank Body", "type": "Vessel"},
            {"suffix": "AGT", "name": "Agitator", "type": "Agitator"},
        ],
        "maintainable_items": [
            {"suffix": "SEAL01", "name": "Agitator Seal", "type": "Seal"},
            {"suffix": "BRG01", "name": "Agitator Bearing", "type": "Bearing"},
            {"suffix": "NZL01", "name": "Inlet Nozzle", "type": "Nozzle"},
        ]
    },
    "vessel": {
        "subunits": [
            {"suffix": "BODY", "name": "Vessel Body", "type": "Vessel"},
            {"suffix": "INT", "name": "Internals", "type": "Internals"},
        ],
        "maintainable_items": [
            {"suffix": "GSKT01", "name": "Manway Gasket", "type": "Gasket"},
            {"suffix": "NZL01", "name": "Process Nozzle", "type": "Nozzle"},
        ]
    },
    "valve": {
        "subunits": [
            {"suffix": "ACT", "name": "Actuator", "type": "Actuator"},
            {"suffix": "BODY", "name": "Valve Body", "type": "Body"},
        ],
        "maintainable_items": [
            {"suffix": "SEAL01", "name": "Stem Seal", "type": "Seal"},
            {"suffix": "TRIM", "name": "Valve Trim", "type": "Trim"},
        ]
    },
    "instrument": {
        "subunits": [],
        "maintainable_items": [
            {"suffix": "SENS", "name": "Sensor Element", "type": "Sensor"},
            {"suffix": "TXMT", "name": "Transmitter", "type": "Transmitter"},
        ]
    },
}

# Unit pattern recognition (e.g., 1U-10, 2U-20, UNIT-100)
UNIT_PATTERNS = [
    r'\b(\d+U-\d+)\b',  # 1U-10, 2U-20
    r'\b(U-\d+)\b',      # U-100
    r'\b(UNIT[-\s]?\d+)\b',  # UNIT-100, UNIT 100
    r'\b(AREA[-\s]?\d+)\b',  # AREA-1
]

# Equipment tag patterns
EQUIPMENT_TAG_PATTERNS = [
    r'\b(\d+[A-Z]{1,2}-\d+[A-Z]?)\b',  # 1P-4003, 1R-2002A
    r'\b([A-Z]{1,3}-\d+[A-Z]?)\b',      # P-101, CV-201A
    r'\b([A-Z]{1,2}\d+-\d+)\b',         # P01-001
]
