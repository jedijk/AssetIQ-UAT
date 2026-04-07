#!/usr/bin/env python3
"""
Enhance Failure Modes with ISO 14224 Mechanisms, Potential Effects, and Potential Causes
As per reliability engineering standards
"""

# ISO 14224 Standard Failure Mechanisms
ISO_MECHANISMS = {
    # Mechanical mechanisms
    "WEA": "Wear - General",
    "ABR": "Abrasion",
    "ERO": "Erosion",
    "COR": "Corrosion",
    "FAT": "Fatigue",
    "OVH": "Overheating",
    "BRD": "Breakdown (Mechanical)",
    "DEF": "Deformation",
    "FRA": "Fracture",
    "LKG": "Leakage",
    "VIB": "Vibration",
    "CLR": "Clearance/Alignment failure",
    "STK": "Sticking",
    "LOO": "Looseness",
    "BLK": "Blockage/Plugging",
    "BUR": "Bursting",
    "CAV": "Cavitation",
    "CRK": "Cracking",
    # Electrical mechanisms  
    "SHO": "Short circuit",
    "OPN": "Open circuit",
    "EGF": "Earth/ground fault",
    "OHT": "Overheating (Electrical)",
    "FSI": "Faulty signal/indication",
    "FCN": "Faulty connection",
    "NSI": "No signal/indication",
    "INS": "Insulation failure",
    # External mechanisms
    "CON": "Contamination",
    "FOD": "Foreign object damage",
    "MIS": "Miscellaneous",
    # Instrument mechanisms
    "OOA": "Out of adjustment",
    "SWF": "Software fault",
    "CCF": "Common cause failure",
    "CTF": "Control fault",
    "DRF": "Instrument drift",
    # Material mechanisms
    "MAT": "Material degradation",
    "EMB": "Embrittlement",
    "SFT": "Softening",
    "AGE": "Aging",
    # Unknown
    "UNK": "Unknown"
}

# Mapping of failure mode patterns to their enhancements
FAILURE_MODE_ENHANCEMENTS = {
    # ============ ROTATING EQUIPMENT ============
    "Seal Failure": {
        "mechanism": "LKG",
        "potential_effects": ["Process fluid leakage", "Environmental contamination", "Fire/explosion hazard", "Product loss", "Reduced pump efficiency"],
        "potential_causes": ["Seal face wear", "Improper installation", "Shaft misalignment", "Dry running", "Thermal damage", "Chemical attack", "Contaminated seal flush"]
    },
    "Bearing Failure": {
        "mechanism": "WEA",
        "potential_effects": ["Increased vibration", "Excessive noise", "Shaft damage", "Catastrophic failure", "Unplanned shutdown", "Secondary damage to seals"],
        "potential_causes": ["Inadequate lubrication", "Contaminated lubricant", "Misalignment", "Overloading", "Fatigue", "Improper installation", "Electrical discharge machining"]
    },
    "Cavitation": {
        "mechanism": "CAV",
        "potential_effects": ["Impeller erosion", "Reduced pump head", "Excessive noise/vibration", "Seal damage", "Bearing damage", "Reduced flow rate"],
        "potential_causes": ["Insufficient NPSH available", "High suction temperature", "Blocked suction line", "Air entrainment", "Oversized impeller", "Operating off BEP"]
    },
    "Misalignment": {
        "mechanism": "CLR",
        "potential_effects": ["Increased vibration", "Bearing wear", "Coupling damage", "Seal failure", "Increased power consumption", "Shaft fatigue"],
        "potential_causes": ["Thermal growth", "Soft foot", "Pipe strain", "Foundation settlement", "Improper installation", "Coupling wear"]
    },
    "Imbalance": {
        "mechanism": "VIB",
        "potential_effects": ["High vibration levels", "Bearing damage", "Fatigue failures", "Seal leakage", "Foundation damage", "Noise"],
        "potential_causes": ["Deposit buildup", "Erosion/corrosion", "Broken/missing parts", "Manufacturing defects", "Improper repair", "Thermal distortion"]
    },
    "Surge": {
        "mechanism": "VIB",
        "potential_effects": ["Catastrophic compressor damage", "Thrust bearing failure", "Blade damage", "Process upset", "Emergency shutdown", "Seal damage"],
        "potential_causes": ["Operating below minimum flow", "Sudden load change", "Anti-surge valve malfunction", "Blocked discharge", "Process disturbance", "Control system failure"]
    },
    "Blade Damage": {
        "mechanism": "ERO",
        "potential_effects": ["Reduced compressor efficiency", "Imbalance", "Vibration increase", "Potential blade liberation", "Process capacity loss"],
        "potential_causes": ["Foreign object ingestion", "Erosion from particles", "Corrosion", "Fatigue", "Surge damage", "Liquid carry-over"]
    },
    "Lubrication Failure": {
        "mechanism": "OVH",
        "potential_effects": ["Bearing failure", "Increased friction", "Overheating", "Seizure", "Equipment damage", "Unplanned shutdown"],
        "potential_causes": ["Oil degradation", "Contamination", "Insufficient oil level", "Oil pump failure", "Blocked oil passages", "Wrong oil specification"]
    },
    "Rotor Crack": {
        "mechanism": "FAT",
        "potential_effects": ["Catastrophic rotor burst", "Equipment destruction", "Personnel injury", "Extended downtime", "Major repair costs"],
        "potential_causes": ["Thermal fatigue", "High cycle fatigue", "Stress corrosion cracking", "Material defects", "Overspeed events", "Improper heat treatment"]
    },
    "Dry Running": {
        "mechanism": "OVH",
        "potential_effects": ["Seal destruction", "Bearing damage", "Impeller damage", "Equipment seizure", "Complete pump failure"],
        "potential_causes": ["Loss of prime", "Low tank level", "Blocked suction", "Valve closed", "Operator error", "Instrumentation failure"]
    },

    # ============ STATIC EQUIPMENT ============
    "Internal Corrosion": {
        "mechanism": "COR",
        "potential_effects": ["Wall thinning", "Leak development", "Structural failure", "Product contamination", "Unplanned shutdown"],
        "potential_causes": ["Corrosive process fluid", "Inadequate material selection", "Incorrect chemical treatment", "pH excursion", "Oxygen ingress", "MIC"]
    },
    "External Corrosion": {
        "mechanism": "COR",
        "potential_effects": ["Wall thinning", "Support degradation", "Leak", "Structural failure", "Insulation damage"],
        "potential_causes": ["Coating failure", "CUI", "Marine environment", "Chemical exposure", "Inadequate maintenance", "Condensation"]
    },
    "Fouling": {
        "mechanism": "BLK",
        "potential_effects": ["Reduced heat transfer", "Increased pressure drop", "Higher energy consumption", "Reduced throughput", "Tube blockage"],
        "potential_causes": ["Scaling", "Biological growth", "Particulate deposition", "Chemical precipitation", "Polymerization", "Inadequate treatment"]
    },
    "Tube Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Cross-contamination", "Product quality issues", "Reduced efficiency", "Environmental release", "Process upset"],
        "potential_causes": ["Corrosion", "Erosion", "Vibration fatigue", "Thermal stress", "Tube-to-tubesheet joint failure", "Manufacturing defect"]
    },
    "Tube Rupture": {
        "mechanism": "BUR",
        "potential_effects": ["Sudden pressure loss", "Major leak", "Fire/explosion risk", "Process shutdown", "Personnel injury risk"],
        "potential_causes": ["Severe corrosion", "Overpressure", "Thermal shock", "Vibration fatigue", "External damage", "Design error"]
    },
    "Overpressure": {
        "mechanism": "BUR",
        "potential_effects": ["Vessel rupture", "Safety valve lift", "Process trip", "Equipment damage", "Personnel injury"],
        "potential_causes": ["Control failure", "Blocked outlet", "External fire", "Thermal expansion", "Runaway reaction", "Operator error"]
    },
    "Stress Corrosion Cracking": {
        "mechanism": "CRK",
        "potential_effects": ["Through-wall cracking", "Leak", "Sudden failure", "Loss of containment", "Environmental release"],
        "potential_causes": ["Tensile stress + corrosive environment", "Chloride exposure", "Caustic embrittlement", "Hydrogen sulfide", "Polythionic acid", "Ammonia"]
    },
    "Thermal Fatigue": {
        "mechanism": "FAT",
        "potential_effects": ["Crack initiation", "Leak development", "Structural failure", "Reduced remaining life"],
        "potential_causes": ["Temperature cycling", "Thermal shock", "Uneven heating/cooling", "Design inadequacy", "Startup/shutdown cycles"]
    },
    "Weld Failure": {
        "mechanism": "CRK",
        "potential_effects": ["Leak", "Structural failure", "Loss of containment", "Process shutdown", "Repair required"],
        "potential_causes": ["Welding defects", "Fatigue", "Corrosion", "Stress concentration", "Poor weld procedure", "Hydrogen cracking"]
    },
    "CUI": {
        "mechanism": "COR",
        "potential_effects": ["Hidden wall thinning", "Sudden leak", "Structural failure", "Insulation damage", "Costly repairs"],
        "potential_causes": ["Water ingress under insulation", "Damaged jacketing", "Temperature cycling", "Poor sealing", "Chloride concentration"]
    },

    # ============ PIPING ============
    "Corrosion Leak": {
        "mechanism": "COR",
        "potential_effects": ["Product loss", "Environmental contamination", "Fire hazard", "Process upset", "Safety risk"],
        "potential_causes": ["Internal corrosion", "External corrosion", "CUI", "Galvanic corrosion", "MIC", "Erosion-corrosion"]
    },
    "Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Wall thinning", "Leak development", "Reduced pipe life", "Noise", "Particulate generation"],
        "potential_causes": ["High velocity flow", "Solid particles", "Sand", "Cavitation", "Impingement", "Droplet erosion"]
    },
    "Seat Leakage": {
        "mechanism": "LKG",
        "potential_effects": ["Passing flow", "Loss of isolation", "Process control issues", "Energy loss", "Product loss"],
        "potential_causes": ["Seat wear", "Corrosion", "Erosion", "Debris in seat", "Thermal distortion", "Inadequate torque"]
    },
    "Valve Stuck": {
        "mechanism": "STK",
        "potential_effects": ["Loss of control", "Process upset", "Safety risk", "Emergency shutdown required", "Manual intervention"],
        "potential_causes": ["Corrosion products", "Scale buildup", "Galling", "Mechanical damage", "Insufficient lubrication", "Stem packing too tight"]
    },
    "Gasket Failure": {
        "mechanism": "LKG",
        "potential_effects": ["Flange leak", "Product loss", "Fire/explosion hazard", "Environmental release", "Process shutdown"],
        "potential_causes": ["Improper bolt torque", "Gasket creep", "Thermal cycling", "Chemical attack", "Wrong gasket type", "Flange misalignment"]
    },
    "Flange Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Product loss", "Fire hazard", "Environmental release", "Corrosion of bolts", "Safety risk"],
        "potential_causes": ["Gasket failure", "Bolt relaxation", "Thermal cycling", "Vibration", "Flange damage", "Improper assembly"]
    },
    "Fatigue Crack": {
        "mechanism": "FAT",
        "potential_effects": ["Leak development", "Pipe failure", "Loss of containment", "Process shutdown"],
        "potential_causes": ["Vibration", "Pressure cycling", "Thermal cycling", "Flow-induced vibration", "Poor support", "Stress concentration"]
    },
    "Thermal Expansion Failure": {
        "mechanism": "DEF",
        "potential_effects": ["Pipe stress", "Support damage", "Flange leaks", "Equipment nozzle loads", "Bellows failure"],
        "potential_causes": ["Inadequate expansion provision", "Locked supports", "Design error", "Temperature excursion", "Blocked expansion loops"]
    },
    "Water Hammer": {
        "mechanism": "BUR",
        "potential_effects": ["Pipe damage", "Support failure", "Valve damage", "Pump trip", "Noise", "Flange leaks"],
        "potential_causes": ["Rapid valve closure", "Pump trip", "Steam condensate", "Air pockets", "Column separation", "Control instability"]
    },
    "Blockage": {
        "mechanism": "BLK",
        "potential_effects": ["Reduced flow", "Increased pressure drop", "Process upset", "Pump damage", "Production loss"],
        "potential_causes": ["Scale buildup", "Solids accumulation", "Polymerization", "Hydrate formation", "Wax deposition", "Foreign objects"]
    },
    "MIC": {
        "mechanism": "COR",
        "potential_effects": ["Localized corrosion", "Pitting", "Under-deposit attack", "Leak", "Rapid wall loss"],
        "potential_causes": ["Sulfate-reducing bacteria", "Acid-producing bacteria", "Stagnant water", "Low flow velocity", "Biofilm formation"]
    },
    "Actuator Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Loss of valve control", "Fail position operation", "Process upset", "Safety impact", "Manual operation required"],
        "potential_causes": ["Air supply failure", "Diaphragm rupture", "Spring failure", "Motor burnout", "Gear damage", "Corrosion"]
    },
    "Stem Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Fugitive emissions", "Product loss", "Fire hazard", "Environmental violation", "Packing degradation"],
        "potential_causes": ["Packing wear", "Stem scoring", "Thermal cycling", "Chemical attack", "Improper packing installation"]
    },
    "Scaling": {
        "mechanism": "BLK",
        "potential_effects": ["Reduced flow area", "Increased pressure drop", "Heat transfer reduction", "Valve sticking"],
        "potential_causes": ["Hard water", "Temperature change", "pH change", "Supersaturation", "Inadequate treatment"]
    },
    "Support Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Pipe sagging", "Stress on connections", "Vibration increase", "Potential pipe failure"],
        "potential_causes": ["Corrosion", "Overloading", "Design error", "Foundation failure", "Thermal movement", "External damage"]
    },
    "Freeze Rupture": {
        "mechanism": "BUR",
        "potential_effects": ["Pipe burst", "Major leak", "Equipment damage", "Extended downtime", "Water damage"],
        "potential_causes": ["Inadequate freeze protection", "Heat tracing failure", "Insulation damage", "Dead legs", "Low ambient temperature"]
    },
    "Sand Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Wall thinning", "Elbow wear", "Valve damage", "Leak development", "Shortened life"],
        "potential_causes": ["Sand production", "High velocity", "Turbulence", "Poor separation", "Material selection"]
    },

    # ============ ELECTRICAL ============
    "Motor Overheating": {
        "mechanism": "OHT",
        "potential_effects": ["Winding insulation damage", "Bearing damage", "Reduced motor life", "Trip", "Fire risk"],
        "potential_causes": ["Overload", "High ambient temperature", "Blocked ventilation", "Low voltage", "Phase imbalance", "Frequent starts"]
    },
    "Insulation Breakdown": {
        "mechanism": "INS",
        "potential_effects": ["Ground fault", "Phase-to-phase fault", "Motor failure", "Fire risk", "Personnel hazard"],
        "potential_causes": ["Aging", "Overheating", "Moisture ingress", "Contamination", "Voltage spikes", "Mechanical damage"]
    },
    "Winding Failure": {
        "mechanism": "INS",
        "potential_effects": ["Motor trip", "Ground fault", "Phase fault", "Complete motor failure", "Production loss"],
        "potential_causes": ["Insulation degradation", "Overheating", "Moisture", "Contamination", "Manufacturing defect", "Overload"]
    },
    "Rotor Bar Failure": {
        "mechanism": "FAT",
        "potential_effects": ["Increased current", "Vibration", "Overheating", "Reduced torque", "Motor damage"],
        "potential_causes": ["Thermal stress", "High starting current", "Frequent starts", "Manufacturing defect", "Fatigue"]
    },
    "VFD Failure": {
        "mechanism": "OHT",
        "potential_effects": ["Motor trip", "Loss of speed control", "Process upset", "Production loss"],
        "potential_causes": ["Component aging", "Overheating", "Power quality issues", "Contamination", "Voltage transients", "Capacitor failure"]
    },
    "Transformer Failure": {
        "mechanism": "INS",
        "potential_effects": ["Power outage", "Fire risk", "Oil leak", "Equipment damage", "Production loss"],
        "potential_causes": ["Insulation aging", "Overloading", "Lightning strike", "Moisture ingress", "Oil degradation", "Winding failure"]
    },
    "Cable Failure": {
        "mechanism": "INS",
        "potential_effects": ["Power loss", "Ground fault", "Fire risk", "Equipment trip", "Safety hazard"],
        "potential_causes": ["Insulation aging", "Mechanical damage", "Overheating", "Water treeing", "Chemical attack", "Rodent damage"]
    },
    "Switchgear Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Failure to trip", "Failure to close", "Arc flash", "Power outage", "Safety hazard"],
        "potential_causes": ["Mechanism wear", "Contact erosion", "Insulation failure", "Control circuit fault", "Contamination"]
    },
    "Generator Failure": {
        "mechanism": "INS",
        "potential_effects": ["Power outage", "Load shedding", "Process shutdown", "Fire risk", "Major repair"],
        "potential_causes": ["Winding failure", "Bearing failure", "Excitation fault", "Cooling system failure", "Overspeed"]
    },
    "UPS Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Critical load loss", "Data loss", "Process trip", "Safety system impact"],
        "potential_causes": ["Battery failure", "Inverter failure", "Capacitor aging", "Fan failure", "Overload", "Component aging"]
    },
    "Battery Failure": {
        "mechanism": "AGE",
        "potential_effects": ["Reduced backup time", "UPS failure", "Emergency system impact", "Sudden capacity loss"],
        "potential_causes": ["Aging", "Overcharging", "Undercharging", "High temperature", "Cell failure", "Electrolyte loss"]
    },

    # ============ INSTRUMENTATION ============
    "Sensor Failure": {
        "mechanism": "DRF",
        "potential_effects": ["Incorrect reading", "Control upset", "Safety impact", "False alarms", "Process trip"],
        "potential_causes": ["Drift", "Fouling", "Physical damage", "Calibration error", "Electrical fault", "Environmental exposure"]
    },
    "Transmitter Failure": {
        "mechanism": "FSI",
        "potential_effects": ["Loss of signal", "Control system upset", "Process trip", "Manual operation required"],
        "potential_causes": ["Electronics failure", "Power supply issue", "Environmental damage", "Calibration drift", "Wiring fault"]
    },
    "Control Valve Failure": {
        "mechanism": "STK",
        "potential_effects": ["Loss of control", "Process upset", "Safety impact", "Product quality issues", "Trip"],
        "potential_causes": ["Actuator failure", "Positioner failure", "Sticking", "Seat leakage", "Trim damage", "Air supply loss"]
    },
    "PLC Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Control system outage", "Process shutdown", "Manual operation", "Production loss"],
        "potential_causes": ["CPU failure", "I/O module failure", "Power supply failure", "Software fault", "Communication failure"]
    },
    "DCS Failure": {
        "mechanism": "SWF",
        "potential_effects": ["Plant-wide control loss", "Emergency shutdown", "Production loss", "Safety impact"],
        "potential_causes": ["Server failure", "Network failure", "Software fault", "Database corruption", "Redundancy failure"]
    },
    "Analyzer Failure": {
        "mechanism": "OOA",
        "potential_effects": ["Loss of process analysis", "Quality issues", "Environmental compliance risk", "Manual sampling required"],
        "potential_causes": ["Sample system issue", "Reagent depletion", "Sensor degradation", "Calibration drift", "Electronics failure"]
    },
    "Flow Meter Failure": {
        "mechanism": "DRF",
        "potential_effects": ["Incorrect flow reading", "Control issues", "Custody transfer errors", "Process upset"],
        "potential_causes": ["Fouling", "Erosion", "Calibration drift", "Electronics failure", "Air/gas in liquid", "Installation issues"]
    },
    "Level Sensor Failure": {
        "mechanism": "FSI",
        "potential_effects": ["Incorrect level reading", "Tank overflow", "Pump damage", "Process upset"],
        "potential_causes": ["Fouling", "Coating", "Mechanical damage", "Calibration error", "Process buildup", "Electronics failure"]
    },
    "Pressure Sensor Failure": {
        "mechanism": "DRF",
        "potential_effects": ["Incorrect pressure reading", "Safety system impact", "Control upset", "Trip"],
        "potential_causes": ["Diaphragm damage", "Drift", "Plugged impulse line", "Overpressure", "Environmental damage"]
    },
    "Temperature Sensor Failure": {
        "mechanism": "DRF",
        "potential_effects": ["Incorrect temperature reading", "Control upset", "Safety impact", "Product quality issues"],
        "potential_causes": ["Thermowell damage", "Drift", "Open circuit", "Sheath damage", "Connection issues", "Aging"]
    },
    "Safety Valve Failure": {
        "mechanism": "LKG",
        "potential_effects": ["Overpressure risk", "Process loss through passing", "Environmental release", "Safety system failure"],
        "potential_causes": ["Seat damage", "Spring relaxation", "Corrosion", "Fouling", "Improper set pressure", "Mechanical damage"]
    },
    "ESD System Failure": {
        "mechanism": "CCF",
        "potential_effects": ["Safety system unavailable", "Regulatory violation", "Process risk", "Potential incident"],
        "potential_causes": ["Logic solver failure", "Sensor failure", "Final element failure", "Power loss", "Software fault", "Common cause"]
    },
    "Fire Detection Failure": {
        "mechanism": "FSI",
        "potential_effects": ["Delayed fire response", "Increased fire damage", "Personnel risk", "Regulatory violation"],
        "potential_causes": ["Detector fouling", "Sensitivity drift", "Wiring fault", "Panel failure", "Environmental interference"]
    },
    "Gas Detection Failure": {
        "mechanism": "DRF",
        "potential_effects": ["Undetected gas release", "Personnel hazard", "Delayed response", "Regulatory violation"],
        "potential_causes": ["Sensor poisoning", "Calibration drift", "Sensor aging", "Environmental factors", "Electronics failure"]
    },

    # ============ SAFETY SYSTEMS ============
    "PSV Fail to Open": {
        "mechanism": "STK",
        "potential_effects": ["Overpressure", "Vessel rupture", "Major incident", "Personnel injury", "Environmental release"],
        "potential_causes": ["Seat bonding", "Corrosion", "Paint over spring", "Set pressure too high", "Mechanical blockage"]
    },
    "PSV Passing": {
        "mechanism": "LKG",
        "potential_effects": ["Product loss", "Flare load", "Environmental release", "Energy loss", "Process upset"],
        "potential_causes": ["Seat damage", "Corrosion", "Improper seating", "Debris", "Set pressure too low", "Previous lift damage"]
    },
    "Rupture Disc Failure": {
        "mechanism": "BUR",
        "potential_effects": ["Premature burst", "Fail to burst", "Process loss", "Safety impact"],
        "potential_causes": ["Fatigue", "Corrosion", "Overpressure cycling", "Manufacturing defect", "Improper installation"]
    },
    "Fire Suppression Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Inadequate fire response", "Increased fire damage", "Personnel risk", "Asset loss"],
        "potential_causes": ["Valve failure", "Nozzle blockage", "Pipe corrosion", "Pump failure", "Control panel fault"]
    },
    "Emergency Shutdown Failure": {
        "mechanism": "CCF",
        "potential_effects": ["Safety function unavailable", "Extended incident", "Major consequence", "Regulatory violation"],
        "potential_causes": ["Logic solver failure", "Sensor failure", "Valve failure", "Power failure", "Common cause failure"]
    },

    # ============ COMPONENT TYPES ============
    "Bearing Seizure": {
        "mechanism": "STK",
        "potential_effects": ["Shaft damage", "Equipment destruction", "Fire risk", "Extended downtime", "Secondary damage"],
        "potential_causes": ["Complete lubrication loss", "Severe contamination", "Extreme overload", "Excessive clearance loss", "Metal-to-metal contact"]
    },
    "Bearing Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Increased vibration", "Noise", "Temperature rise", "Clearance increase", "Eventual failure"],
        "potential_causes": ["Normal wear progression", "Inadequate lubrication", "Contamination", "Misalignment", "Overloading"]
    },
    "Bearing Overheating": {
        "mechanism": "OVH",
        "potential_effects": ["Lubricant degradation", "Accelerated wear", "Seizure risk", "Shaft damage", "Fire risk"],
        "potential_causes": ["Insufficient lubrication", "Overloading", "High speed", "Misalignment", "Contamination", "Ambient heat"]
    },
    "Bearing Fatigue": {
        "mechanism": "FAT",
        "potential_effects": ["Spalling", "Increased vibration", "Metal particles in oil", "Bearing failure"],
        "potential_causes": ["Normal fatigue life", "Overloading", "Improper fit", "Material defects", "Lubrication issues"]
    },
    "Thrust Pad Damage": {
        "mechanism": "WEA",
        "potential_effects": ["Axial movement", "Rotor rub", "Efficiency loss", "Catastrophic failure risk"],
        "potential_causes": ["Excessive thrust load", "Oil film breakdown", "Contamination", "Misalignment", "Thermal distortion"]
    },
    "Axial Overload": {
        "mechanism": "DEF",
        "potential_effects": ["Thrust bearing damage", "Seal damage", "Rotor contact", "Vibration"],
        "potential_causes": ["Process upset", "Surge", "Coupling failure", "Thermal growth", "Design error"]
    },
    "Babbitt Damage": {
        "mechanism": "WEA",
        "potential_effects": ["Metal particles", "Increased clearance", "Temperature rise", "Potential seizure"],
        "potential_causes": ["Overloading", "Oil contamination", "Electrical discharge", "Fatigue", "Thermal cycling"]
    },
    "Oil Film Breakdown": {
        "mechanism": "OVH",
        "potential_effects": ["Metal contact", "Rapid wear", "Overheating", "Seizure risk"],
        "potential_causes": ["Low oil pressure", "High temperature", "Wrong viscosity", "Contamination", "Excessive load"]
    },
    "Face Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Increased leakage", "Seal failure", "Product loss", "Environmental release"],
        "potential_causes": ["Normal wear", "Dry running", "Contamination", "Improper materials", "Thermal distortion"]
    },
    "Spring Failure": {
        "mechanism": "FAT",
        "potential_effects": ["Loss of face contact", "Excessive leakage", "Seal failure"],
        "potential_causes": ["Fatigue", "Corrosion", "Overstress", "Material defect", "High temperature"]
    },
    "O-Ring Degradation": {
        "mechanism": "MAT",
        "potential_effects": ["Secondary leakage", "Seal failure", "Shaft damage"],
        "potential_causes": ["Chemical attack", "High temperature", "Aging", "Compression set", "Incompatible fluid"]
    },
    "Barrier Fluid Loss": {
        "mechanism": "LKG",
        "potential_effects": ["Seal face damage", "Process contamination", "Seal failure"],
        "potential_causes": ["Reservoir leak", "Pressure system failure", "Consumption", "Piping leak"]
    },
    "Labyrinth Damage": {
        "mechanism": "WEA",
        "potential_effects": ["Increased leakage", "Contamination ingress", "Efficiency loss"],
        "potential_causes": ["Rotor contact", "Thermal distortion", "Erosion", "Assembly damage"]
    },
    "Primary Seal Failure": {
        "mechanism": "LKG",
        "potential_effects": ["Process gas leakage", "Secondary seal loading", "Environmental release"],
        "potential_causes": ["Face damage", "Contamination", "Thermal shock", "Pressure spike", "Dry running"]
    },
    "Secondary Seal Failure": {
        "mechanism": "LKG",
        "potential_effects": ["Loss of containment", "Environmental release", "Fire risk"],
        "potential_causes": ["Age", "Overload from primary failure", "Material degradation", "Damage"]
    },
    "Seal Gas Contamination": {
        "mechanism": "CON",
        "potential_effects": ["Seal face damage", "Reduced seal life", "Increased leakage"],
        "potential_causes": ["Filter failure", "Liquid carryover", "System contamination", "Wrong gas source"]
    },
    "Coupling Misalignment": {
        "mechanism": "CLR",
        "potential_effects": ["Vibration", "Element wear", "Bearing load", "Energy loss"],
        "potential_causes": ["Thermal growth", "Foundation movement", "Installation error", "Wear"]
    },
    "Element Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Increased vibration", "Potential separation", "Noise"],
        "potential_causes": ["Normal wear", "Misalignment", "Overload", "Contamination", "Age"]
    },
    "Coupling Failure": {
        "mechanism": "FRA",
        "potential_effects": ["Complete separation", "Equipment damage", "Personnel risk", "Extended downtime"],
        "potential_causes": ["Fatigue", "Overload", "Corrosion", "Manufacturing defect", "Improper selection"]
    },
    "Impeller Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Reduced head", "Efficiency loss", "Imbalance", "Vibration"],
        "potential_causes": ["Abrasive particles", "Cavitation", "Corrosion-erosion", "High velocity"]
    },
    "Impeller Imbalance": {
        "mechanism": "VIB",
        "potential_effects": ["High vibration", "Bearing wear", "Seal damage", "Fatigue"],
        "potential_causes": ["Erosion", "Deposit buildup", "Damage", "Manufacturing defect"]
    },
    "Impeller Cracking": {
        "mechanism": "CRK",
        "potential_effects": ["Catastrophic failure", "Debris generation", "Equipment damage"],
        "potential_causes": ["Fatigue", "Cavitation damage", "Corrosion", "Stress concentration", "Material defect"]
    },
    "Rotor Bow": {
        "mechanism": "DEF",
        "potential_effects": ["High vibration", "Rub risk", "Bearing damage", "Restricted operation"],
        "potential_causes": ["Thermal distortion", "Gravity sag", "Improper storage", "Uneven cooling"]
    },
    "Rotor Rub": {
        "mechanism": "WEA",
        "potential_effects": ["Local heating", "Material transfer", "Vibration", "Seal damage"],
        "potential_causes": ["Thermal growth", "Bearing wear", "Misalignment", "Seal clearance loss"]
    },
    "Shaft Fatigue": {
        "mechanism": "FAT",
        "potential_effects": ["Crack propagation", "Shaft failure", "Catastrophic damage"],
        "potential_causes": ["Cyclic stress", "Stress concentration", "Corrosion", "Material defect", "Overload"]
    },
    "Shaft Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Seal leakage", "Bearing clearance", "Vibration"],
        "potential_causes": ["Packing wear", "Sleeve wear", "Fretting", "Corrosion"]
    },
    "Gear Tooth Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Backlash increase", "Noise", "Vibration", "Efficiency loss"],
        "potential_causes": ["Normal wear", "Inadequate lubrication", "Misalignment", "Overload"]
    },
    "Gear Pitting": {
        "mechanism": "FAT",
        "potential_effects": ["Surface damage", "Noise increase", "Accelerated wear", "Eventual failure"],
        "potential_causes": ["Surface fatigue", "Lubrication issues", "Overload", "Material quality"]
    },
    "Gear Tooth Breakage": {
        "mechanism": "FRA",
        "potential_effects": ["Sudden failure", "Secondary damage", "Extended downtime"],
        "potential_causes": ["Overload", "Fatigue", "Material defect", "Foreign object", "Misalignment"]
    },
    "Gasket Blowout": {
        "mechanism": "BUR",
        "potential_effects": ["Sudden leak", "Fire hazard", "Environmental release", "Process loss"],
        "potential_causes": ["Overpressure", "Improper torque", "Wrong gasket", "Flange damage", "Thermal shock"]
    },
    "Gasket Compression Set": {
        "mechanism": "MAT",
        "potential_effects": ["Gradual leak", "Bolt loosening", "Retorque required"],
        "potential_causes": ["Age", "Temperature cycling", "Creep", "Material degradation"]
    },
    "O-Ring Extrusion": {
        "mechanism": "DEF",
        "potential_effects": ["Seal damage", "Leak", "Debris generation"],
        "potential_causes": ["Excessive clearance", "Overpressure", "Incorrect hardness", "High temperature"]
    },
    "O-Ring Chemical Attack": {
        "mechanism": "MAT",
        "potential_effects": ["Seal swelling/shrinking", "Hardening", "Leak", "Seal failure"],
        "potential_causes": ["Incompatible fluid", "Temperature excursion", "Chemical concentration"]
    },
    "Packing Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Product loss", "Environmental release", "Fire hazard"],
        "potential_causes": ["Wear", "Incorrect adjustment", "Shaft damage", "Wrong packing type"]
    },
    "Packing Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Increased leakage", "More frequent adjustment", "Shaft wear"],
        "potential_causes": ["Normal wear", "Dry running", "Contamination", "Excessive tightening"]
    },
    "Wear Ring Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Increased clearance", "Efficiency loss", "Higher power consumption"],
        "potential_causes": ["Abrasives", "Cavitation", "Normal wear", "Material selection"]
    },
    "Piston Ring Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Blow-by", "Efficiency loss", "Oil consumption", "Power loss"],
        "potential_causes": ["Normal wear", "Contamination", "Improper lubrication", "Overheating"]
    },
    "Piston Scoring": {
        "mechanism": "ABR",
        "potential_effects": ["Increased wear", "Blow-by", "Liner damage", "Seizure risk"],
        "potential_causes": ["Foreign particles", "Lubrication failure", "Overheating", "Misalignment"]
    },
    "Liner Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Increased clearance", "Blow-by", "Oil consumption"],
        "potential_causes": ["Normal wear", "Contamination", "Poor lubrication", "Corrosion"]
    },
    "Diaphragm Rupture": {
        "mechanism": "FRA",
        "potential_effects": ["Loss of pumping action", "Cross-contamination", "Leak"],
        "potential_causes": ["Fatigue", "Overpressure", "Chemical attack", "Manufacturing defect", "Age"]
    },
    "Tube Fouling": {
        "mechanism": "BLK",
        "potential_effects": ["Reduced heat transfer", "Increased pressure drop", "Energy loss"],
        "potential_causes": ["Scaling", "Biological growth", "Particulates", "Chemical precipitation"]
    },
    "Tube Vibration": {
        "mechanism": "VIB",
        "potential_effects": ["Fatigue failure", "Tube-to-baffle wear", "Noise", "Leak"],
        "potential_causes": ["High velocity", "Resonance", "Loose baffles", "Flow-induced excitation"]
    },
    "Baffle Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Tube support loss", "Vibration increase", "Bypass flow"],
        "potential_causes": ["Flow impingement", "Particulates", "High velocity"]
    },
    "Element Burnout": {
        "mechanism": "OPN",
        "potential_effects": ["No heat output", "Process upset", "Temperature control loss"],
        "potential_causes": ["Age", "Overheating", "Power surge", "Contamination", "Manufacturing defect"]
    },
    "Element Degradation": {
        "mechanism": "AGE",
        "potential_effects": ["Reduced heat output", "Temperature control issues", "Increased resistance"],
        "potential_causes": ["Aging", "Oxidation", "Thermal cycling", "Contamination"]
    },
    "Coil Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Refrigerant loss", "Cooling capacity loss", "Environmental release"],
        "potential_causes": ["Corrosion", "Vibration fatigue", "Manufacturing defect", "Physical damage"]
    },
    "Coil Icing": {
        "mechanism": "BLK",
        "potential_effects": ["Airflow restriction", "Efficiency loss", "Compressor damage risk"],
        "potential_causes": ["Low refrigerant", "Airflow restriction", "Low ambient", "Control fault"]
    },
    "Screw Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Output reduction", "Quality issues", "Energy increase"],
        "potential_causes": ["Abrasive materials", "Normal wear", "Contamination", "Corrosion"]
    },
    "Screw Breakage": {
        "mechanism": "FRA",
        "potential_effects": ["Production stop", "Barrel damage", "Extended downtime"],
        "potential_causes": ["Overload", "Fatigue", "Foreign object", "Material defect"]
    },
    "Barrel Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Output reduction", "Quality issues", "Increased clearance"],
        "potential_causes": ["Abrasive materials", "Normal wear", "Corrosion", "Overheating"]
    },
    "Die Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Product quality issues", "Dimensional changes", "Surface defects"],
        "potential_causes": ["Abrasive materials", "Normal wear", "Corrosion", "High temperature"]
    },
    "Die Buildup": {
        "mechanism": "BLK",
        "potential_effects": ["Surface defects", "Flow restriction", "Quality issues"],
        "potential_causes": ["Degraded material", "Wrong temperature", "Contamination", "Improper purging"]
    },
    "Winding Insulation Failure": {
        "mechanism": "INS",
        "potential_effects": ["Short circuit", "Ground fault", "Motor failure", "Fire risk"],
        "potential_causes": ["Thermal aging", "Contamination", "Moisture", "Voltage stress", "Mechanical damage"]
    },
    "Stator Core Damage": {
        "mechanism": "OVH",
        "potential_effects": ["Hot spots", "Efficiency loss", "Insulation damage", "Fire risk"],
        "potential_causes": ["Overheating", "Mechanical damage", "Short circuits", "Contamination"]
    },
    "Turn-to-Turn Short": {
        "mechanism": "SHO",
        "potential_effects": ["Local overheating", "Winding damage", "Motor failure"],
        "potential_causes": ["Insulation breakdown", "Contamination", "Voltage spike", "Thermal stress"]
    },
    "Brush Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Poor commutation", "Sparking", "Commutator damage"],
        "potential_causes": ["Normal wear", "Contamination", "Wrong grade", "Vibration", "Overload"]
    },
    "Commutator Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Poor contact", "Sparking", "Motor damage"],
        "potential_causes": ["Brush wear", "Contamination", "Electrical erosion", "Eccentricity"]
    },
    "Contact Wear": {
        "mechanism": "WEA",
        "potential_effects": ["High resistance", "Overheating", "Failure to interrupt"],
        "potential_causes": ["Arcing", "Normal wear", "Overload", "Contamination"]
    },
    "Trip Failure": {
        "mechanism": "STK",
        "potential_effects": ["Failed protection", "Equipment damage", "Safety hazard", "Fire risk"],
        "potential_causes": ["Mechanism stuck", "Trip coil failure", "Control fault", "Lubrication issue"]
    },
    "Coil Failure": {
        "mechanism": "OPN",
        "potential_effects": ["No pickup", "Control loss", "System inoperative"],
        "potential_causes": ["Burnout", "Open circuit", "Insulation failure", "Voltage issue"]
    },
    "Contact Welding": {
        "mechanism": "OVH",
        "potential_effects": ["Stuck closed", "Cannot disconnect", "Safety hazard"],
        "potential_causes": ["Inrush current", "Overload", "Contact bounce", "Wrong rating"]
    },
    "Fuse Degradation": {
        "mechanism": "AGE",
        "potential_effects": ["Nuisance operation", "Protection loss", "Unpredictable behavior"],
        "potential_causes": ["Age", "Heat cycling", "Overcurrent events", "Environmental"]
    },
    "Capacitor Failure": {
        "mechanism": "AGE",
        "potential_effects": ["Loss of function", "Power quality issues", "Circuit failure"],
        "potential_causes": ["Age", "Overheating", "Overvoltage", "Ripple current", "Manufacturing defect"]
    },
    "PSU Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Equipment shutdown", "Control loss", "Data loss"],
        "potential_causes": ["Component failure", "Overheating", "Power quality", "Age", "Fan failure"]
    },
    "Channel Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Input/output loss", "Partial control loss", "Alarms"],
        "potential_causes": ["Component failure", "Wiring fault", "Power issue", "Environmental"]
    },
    "Network Failure": {
        "mechanism": "FCN",
        "potential_effects": ["Communication loss", "Control issues", "System fragmentation"],
        "potential_causes": ["Cable damage", "Connector issue", "Module failure", "EMI"]
    },
    "TC Drift": {
        "mechanism": "DRF",
        "potential_effects": ["Measurement error", "Control upset", "Quality issues"],
        "potential_causes": ["Age", "Temperature exposure", "Contamination", "Junction degradation"]
    },
    "TC Open Circuit": {
        "mechanism": "OPN",
        "potential_effects": ["Signal loss", "Upscale indication", "Control upset"],
        "potential_causes": ["Wire break", "Connection failure", "Vibration", "Corrosion"]
    },
    "RTD Drift": {
        "mechanism": "DRF",
        "potential_effects": ["Measurement error", "Control upset", "Quality issues"],
        "potential_causes": ["Age", "Thermal stress", "Contamination", "Wire resistance change"]
    },
    "RTD Element Failure": {
        "mechanism": "OPN",
        "potential_effects": ["Signal loss", "Bad reading", "Control upset"],
        "potential_causes": ["Wire break", "Element damage", "Moisture ingress", "Vibration"]
    },
    "Solenoid Coil Failure": {
        "mechanism": "OPN",
        "potential_effects": ["Valve stuck", "No actuation", "Control loss"],
        "potential_causes": ["Burnout", "Voltage issue", "Contamination", "Age", "Mechanical damage"]
    },
    "Solenoid Valve Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Passing flow", "Pressure loss", "Control issues"],
        "potential_causes": ["Seat wear", "Contamination", "Corrosion", "Diaphragm damage"]
    },
    "Switch Contact Failure": {
        "mechanism": "OPN",
        "potential_effects": ["No signal", "False indication", "Interlock failure"],
        "potential_causes": ["Contact wear", "Contamination", "Mechanical damage", "Corrosion"]
    },
    "Orifice Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Measurement error", "Control issues", "Over-ranging"],
        "potential_causes": ["Abrasive particles", "High velocity", "Cavitation", "Corrosion"]
    },
    "Gauge Drift": {
        "mechanism": "DRF",
        "potential_effects": ["Incorrect reading", "Operator error", "Safety impact"],
        "potential_causes": ["Age", "Vibration", "Overpressure", "Temperature cycling"]
    },
    "Bourdon Tube Failure": {
        "mechanism": "FRA",
        "potential_effects": ["Gauge failure", "Leak risk", "No indication"],
        "potential_causes": ["Fatigue", "Overpressure", "Corrosion", "Vibration"]
    },
    "Glass Fouling": {
        "mechanism": "CON",
        "potential_effects": ["Obscured level", "Operator error", "Wrong level indication"],
        "potential_causes": ["Process deposits", "Contamination", "Condensation"]
    },
    "Glass Breakage": {
        "mechanism": "FRA",
        "potential_effects": ["Leak", "Level indication loss", "Safety hazard"],
        "potential_causes": ["Thermal shock", "Overpressure", "Physical damage", "Corrosion of frame"]
    },
    "Low Oil Level": {
        "mechanism": "LKG",
        "potential_effects": ["Inadequate lubrication", "Bearing damage risk", "Overheating"],
        "potential_causes": ["Leak", "Consumption", "Inadequate makeup", "Seal failure"]
    },
    "Oil Pump Failure": {
        "mechanism": "BRD",
        "potential_effects": ["Loss of oil pressure", "Bearing damage", "Equipment trip"],
        "potential_causes": ["Pump wear", "Motor failure", "Cavitation", "Coupling failure"]
    },
    "Oil Contamination": {
        "mechanism": "CON",
        "potential_effects": ["Accelerated wear", "Filter blockage", "Bearing damage"],
        "potential_causes": ["Water ingress", "Particle ingress", "Degradation products", "Wrong oil"]
    },
    "Jacket Fouling": {
        "mechanism": "BLK",
        "potential_effects": ["Reduced cooling", "Temperature increase", "Efficiency loss"],
        "potential_causes": ["Scale", "Corrosion products", "Biological growth", "Contamination"]
    },
    "Jacket Leak": {
        "mechanism": "LKG",
        "potential_effects": ["Coolant loss", "Process contamination", "Corrosion"],
        "potential_causes": ["Corrosion", "Erosion", "Weld failure", "Gasket failure"]
    },
    "Belt Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Slippage", "Noise", "Failure risk", "Efficiency loss"],
        "potential_causes": ["Normal wear", "Misalignment", "Tension issues", "Environmental"]
    },
    "Belt Slippage": {
        "mechanism": "STK",
        "potential_effects": ["Speed variation", "Heat generation", "Wear increase", "Noise"],
        "potential_causes": ["Low tension", "Wear", "Contamination", "Overload"]
    },
    "Chain Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Elongation", "Skipping", "Noise", "Failure risk"],
        "potential_causes": ["Normal wear", "Inadequate lubrication", "Misalignment", "Overload"]
    },
    "Sprocket Wear": {
        "mechanism": "WEA",
        "potential_effects": ["Chain wear acceleration", "Noise", "Skipping"],
        "potential_causes": ["Normal wear", "Chain elongation", "Misalignment", "Lubrication"]
    },
    "Internal Corrosion": {
        "mechanism": "COR",
        "potential_effects": ["Wall thinning", "Structural weakness", "Leak risk", "Contamination"],
        "potential_causes": ["Corrosive fluid", "Material selection", "Operating conditions", "No inhibitor"]
    },
    "Internal Damage": {
        "mechanism": "DEF",
        "potential_effects": ["Process upset", "Efficiency loss", "Product quality issues"],
        "potential_causes": ["Mechanical damage", "Corrosion", "Erosion", "Thermal stress"]
    },
    "Tray Damage": {
        "mechanism": "DEF",
        "potential_effects": ["Separation efficiency loss", "Flooding", "Weeping"],
        "potential_causes": ["Corrosion", "Mechanical damage", "Thermal stress", "Improper installation"]
    },
    "Packing Degradation": {
        "mechanism": "MAT",
        "potential_effects": ["Channeling", "Separation efficiency loss", "Pressure drop increase"],
        "potential_causes": ["Age", "Fouling", "Thermal damage", "Mechanical damage"]
    },
    "Display Failure": {
        "mechanism": "BRD",
        "potential_effects": ["No visualization", "Operator blind", "Manual operation"],
        "potential_causes": ["Backlight failure", "Electronics fault", "Power issue", "Connection"]
    },
    "Touchscreen Failure": {
        "mechanism": "BRD",
        "potential_effects": ["No input capability", "Limited operation", "Maintenance required"],
        "potential_causes": ["Calibration loss", "Damage", "Electronics failure", "Contamination"]
    },
    "Casing Crack": {
        "mechanism": "CRK",
        "potential_effects": ["Leak risk", "Structural weakness", "Catastrophic failure risk"],
        "potential_causes": ["Fatigue", "Thermal stress", "Corrosion", "Impact", "Manufacturing defect"]
    },
    "Casing Erosion": {
        "mechanism": "ERO",
        "potential_effects": ["Wall thinning", "Leak risk", "Efficiency loss"],
        "potential_causes": ["Internal flow erosion", "Particle impingement", "Cavitation"]
    },
}

def get_enhancement(failure_mode_name):
    """Get enhancement data for a failure mode, with fallback to generic values."""
    # Direct match
    if failure_mode_name in FAILURE_MODE_ENHANCEMENTS:
        return FAILURE_MODE_ENHANCEMENTS[failure_mode_name]
    
    # Partial match
    for key, value in FAILURE_MODE_ENHANCEMENTS.items():
        if key.lower() in failure_mode_name.lower() or failure_mode_name.lower() in key.lower():
            return value
    
    # Generic fallback based on keywords
    fm_lower = failure_mode_name.lower()
    
    if any(w in fm_lower for w in ["corrosion", "rust", "oxidation"]):
        return {"mechanism": "COR", "potential_effects": ["Material degradation", "Wall thinning", "Leak risk"], "potential_causes": ["Corrosive environment", "Inadequate material", "Protective coating failure"]}
    elif any(w in fm_lower for w in ["wear", "worn", "erosion"]):
        return {"mechanism": "WEA", "potential_effects": ["Clearance increase", "Efficiency loss", "Component damage"], "potential_causes": ["Normal wear progression", "Abrasive particles", "Inadequate lubrication"]}
    elif any(w in fm_lower for w in ["leak", "leakage", "passing"]):
        return {"mechanism": "LKG", "potential_effects": ["Product loss", "Environmental release", "Efficiency loss"], "potential_causes": ["Seal degradation", "Gasket failure", "Material damage"]}
    elif any(w in fm_lower for w in ["stuck", "seize", "jam", "block"]):
        return {"mechanism": "STK", "potential_effects": ["Loss of function", "Process upset", "Equipment damage"], "potential_causes": ["Corrosion products", "Foreign material", "Mechanical binding"]}
    elif any(w in fm_lower for w in ["crack", "fracture", "break"]):
        return {"mechanism": "CRK", "potential_effects": ["Structural failure", "Leak", "Catastrophic damage"], "potential_causes": ["Fatigue", "Stress concentration", "Material defect"]}
    elif any(w in fm_lower for w in ["overh", "hot", "temperature"]):
        return {"mechanism": "OVH", "potential_effects": ["Component damage", "Fire risk", "Performance degradation"], "potential_causes": ["Inadequate cooling", "Overload", "Friction"]}
    elif any(w in fm_lower for w in ["vibrat", "imbalance", "resonan"]):
        return {"mechanism": "VIB", "potential_effects": ["Fatigue damage", "Noise", "Secondary failures"], "potential_causes": ["Imbalance", "Misalignment", "Looseness"]}
    elif any(w in fm_lower for w in ["fail", "fault", "error", "malfunction"]):
        return {"mechanism": "BRD", "potential_effects": ["Loss of function", "Process upset", "Safety impact"], "potential_causes": ["Component failure", "Age", "Environmental factors"]}
    elif any(w in fm_lower for w in ["drift", "calibrat", "accuracy"]):
        return {"mechanism": "DRF", "potential_effects": ["Measurement error", "Control issues", "Quality problems"], "potential_causes": ["Age", "Environmental exposure", "Contamination"]}
    elif any(w in fm_lower for w in ["short", "ground", "insulation"]):
        return {"mechanism": "INS", "potential_effects": ["Electrical failure", "Fire risk", "Equipment damage"], "potential_causes": ["Insulation breakdown", "Moisture", "Contamination"]}
    elif any(w in fm_lower for w in ["contam", "dirt", "foul"]):
        return {"mechanism": "CON", "potential_effects": ["Performance degradation", "Blockage", "Accelerated wear"], "potential_causes": ["Process contamination", "Environmental ingress", "Inadequate filtration"]}
    elif any(w in fm_lower for w in ["fatigue"]):
        return {"mechanism": "FAT", "potential_effects": ["Crack initiation", "Progressive failure", "Sudden failure"], "potential_causes": ["Cyclic loading", "Stress concentration", "Material properties"]}
    else:
        return {"mechanism": "UNK", "potential_effects": ["Equipment malfunction", "Process impact", "Maintenance required"], "potential_causes": ["Various factors", "Operating conditions", "Equipment age"]}


def enhance_failure_modes():
    """Read failure_modes.py and add enhancement fields."""
    import sys
    sys.path.insert(0, '/app/backend')
    from failure_modes import FAILURE_MODES_LIBRARY
    
    enhanced_count = 0
    for fm in FAILURE_MODES_LIBRARY:
        enhancement = get_enhancement(fm["failure_mode"])
        fm["mechanism"] = enhancement["mechanism"]
        fm["mechanism_description"] = ISO_MECHANISMS.get(enhancement["mechanism"], "Unknown")
        fm["potential_effects"] = enhancement["potential_effects"]
        fm["potential_causes"] = enhancement["potential_causes"]
        enhanced_count += 1
    
    return FAILURE_MODES_LIBRARY, enhanced_count


if __name__ == "__main__":
    enhanced, count = enhance_failure_modes()
    print(f"Enhanced {count} failure modes with ISO 14224 data")
    
    # Print sample
    print("\nSample enhanced failure modes:")
    for fm in enhanced[:3]:
        print(f"\n{fm['failure_mode']}:")
        print(f"  Mechanism: {fm['mechanism']} - {fm['mechanism_description']}")
        print(f"  Effects: {fm['potential_effects'][:2]}")
        print(f"  Causes: {fm['potential_causes'][:2]}")
