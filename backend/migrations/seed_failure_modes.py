"""
Migration script to seed failure modes from static library to MongoDB.
Run this once to initialize the failure_modes collection.

Usage: python migrations/seed_failure_modes.py
"""

import os
import sys
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient
from failure_modes import FAILURE_MODES_LIBRARY

# ISO 14224 Failure Mechanism Taxonomy
ISO14224_MECHANISMS = {
    # Mechanical
    "Seal Failure": "MEL - Mechanical - External Leakage",
    "Bearing Failure": "BRD - Mechanical - Bearing Degradation", 
    "Cavitation": "CAV - Mechanical - Cavitation",
    "Misalignment": "MIS - Mechanical - Misalignment",
    "Imbalance": "VIB - Mechanical - Vibration/Imbalance",
    "Surge": "SUR - Mechanical - Surge",
    "Blade Damage": "FTG - Mechanical - Fatigue",
    "Lubrication Failure": "LUB - Mechanical - Lubrication Degradation",
    "Rotor Crack": "CRK - Mechanical - Cracking",
    "Dry Running": "DRY - Mechanical - Dry Running",
    
    # Corrosion
    "Internal Corrosion": "COR - Material - Internal Corrosion",
    "External Corrosion": "COR - Material - External Corrosion",
    "Stress Corrosion Cracking": "SCC - Material - Stress Corrosion Cracking",
    "CUI": "CUI - Material - Corrosion Under Insulation",
    "MIC": "MIC - Material - Microbiologically Induced Corrosion",
    "Dead Leg Corrosion": "COR - Material - Dead Leg Corrosion",
    "Corrosion Leak": "COR - Material - Corrosion",
    
    # Thermal
    "Fouling": "FOU - Process - Fouling/Scaling",
    "Thermal Fatigue": "THF - Material - Thermal Fatigue",
    "Overheating": "OHT - Process - Overheating",
    "Freeze Rupture": "FRZ - Process - Freezing",
    
    # Structural
    "Tube Leak": "LEK - Structural - Leakage",
    "Tube Rupture": "RUP - Structural - Rupture",
    "Weld Failure": "WLD - Structural - Weld Defect",
    "Gasket Failure": "GSK - Structural - Gasket Failure",
    "Flange Leak": "FLK - Structural - Flange Leakage",
    "Fatigue Crack": "FTG - Material - Fatigue Cracking",
    "Support Failure": "SUP - Structural - Support Failure",
    "Anchor Failure": "ANC - Structural - Anchor Failure",
    
    # Flow/Pressure
    "Overpressure": "OVP - Process - Overpressure",
    "Erosion": "ERO - Material - Erosion",
    "Sand Erosion": "ERO - Material - Sand Erosion",
    "Water Hammer": "WHM - Process - Water Hammer",
    "Blockage": "BLK - Process - Blockage/Plugging",
    "Scaling": "SCA - Process - Scaling",
    
    # Valve specific
    "Seat Leakage": "SLK - Valve - Seat Leakage",
    "Valve Stuck": "STK - Valve - Stuck/Seized",
    "Actuator Failure": "ACT - Valve - Actuator Failure",
    "Stem Leak": "STL - Valve - Stem Leakage",
    "Valve Sticking": "STK - Valve - Sticking",
    
    # Instrumentation
    "Sensor Drift": "DRF - Instrument - Drift/Calibration",
    "Sensor Failure": "SNF - Instrument - Sensor Failure",
    "Calibration Error": "CAL - Instrument - Calibration Error",
    "Signal Loss": "SIG - Instrument - Signal Loss",
    "Loop Instability": "CTL - Instrument - Control Loop Instability",
    "PLC Failure": "PLC - Instrument - Controller Failure",
    "Comm Failure": "COM - Instrument - Communication Failure",
    "Alarm Flooding": "ALM - Instrument - Alarm Management",
    "Power Failure": "PWR - Electrical - Power Failure",
    
    # Electrical
    "Motor Burnout": "MBO - Electrical - Motor Burnout",
    "Transformer Failure": "TRF - Electrical - Transformer Failure",
    "Short Circuit": "SHC - Electrical - Short Circuit",
    "Insulation Failure": "INS - Electrical - Insulation Failure",
    "Power Loss": "PWL - Electrical - Power Loss",
    "Relay Failure": "RLY - Electrical - Relay Failure",
    "Ground Fault": "GND - Electrical - Ground Fault",
    "Switchgear Failure": "SWG - Electrical - Switchgear Failure",
    "UPS Failure": "UPS - Electrical - UPS Failure",
    "Harmonics Damage": "HAR - Electrical - Harmonics",
    "Voltage Spike": "VSP - Electrical - Voltage Transient",
    "Generator Failure": "GEN - Electrical - Generator Failure",
    "Battery Degradation": "BAT - Electrical - Battery Degradation",
    "Phase Imbalance": "PHI - Electrical - Phase Imbalance",
    "Arc Flash": "ARC - Electrical - Arc Flash",
    "Loose Connection": "CON - Electrical - Loose Connection",
    "Cooling Failure": "CLG - Electrical - Cooling Failure",
    "Frequency Instability": "FRQ - Electrical - Frequency Instability",
    "Protection Failure": "PRO - Electrical - Protection Failure",
    "Electrical Fire": "FIR - Electrical - Fire",
    
    # Process/Human
    "Incorrect Operation": "OPE - Human - Operator Error",
    "Maintenance Error": "MNT - Human - Maintenance Error",
    "Procedure Not Followed": "PRO - Human - Procedure Violation",
    "Poor Design": "DES - Design - Design Deficiency",
    "Poor Planning": "PLN - Management - Poor Planning",
    "Overload": "OVL - Process - Overload",
    "Underdesign": "UND - Design - Under-design",
    "Material Failure": "MAT - Material - Material Defect",
    "Human Error": "HUM - Human - Human Error",
    "Contamination": "CON - Process - Contamination",
    "Foreign Object Damage": "FOD - Process - Foreign Object",
    
    # Safety
    "Safety System Failure": "SIS - Safety - SIS Failure",
    "PSV Failure": "PSV - Safety - PSV Failure",
    "Fire Suppression Failure": "FSF - Safety - Fire System Failure",
    "Gas Detection Failure": "GAS - Safety - Gas Detection Failure",
    "ESD Failure": "ESD - Safety - ESD Failure",
    
    # Default
    "Unknown": "UNK - Unknown",
}


def get_mechanism_for_failure_mode(failure_mode_name: str) -> str:
    """Map failure mode name to ISO 14224 mechanism."""
    # Try exact match first
    if failure_mode_name in ISO14224_MECHANISMS:
        return ISO14224_MECHANISMS[failure_mode_name]
    
    # Try partial match
    failure_lower = failure_mode_name.lower()
    for key, value in ISO14224_MECHANISMS.items():
        if key.lower() in failure_lower or failure_lower in key.lower():
            return value
    
    # Category-based defaults
    category_defaults = {
        "rotating": "MEL - Mechanical - General",
        "static": "STR - Structural - General",
        "piping": "PIP - Piping - General",
        "instrumentation": "INS - Instrument - General",
        "electrical": "ELE - Electrical - General",
        "process": "PRC - Process - General",
        "safety": "SAF - Safety - General",
        "structural": "STR - Structural - General",
    }
    
    return "UNK - Unknown"


def seed_failure_modes():
    """Seed the failure_modes collection from the static library."""
    
    # Get MongoDB connection
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "reliabilityos")
    
    if not mongo_url:
        print("ERROR: MONGO_URL environment variable not set")
        print("Please set MONGO_URL before running this script")
        sys.exit(1)
    
    print(f"Connecting to MongoDB...")
    client = MongoClient(mongo_url)
    db = client[db_name]
    collection = db["failure_modes"]
    
    # Check if collection already has data
    existing_count = collection.count_documents({})
    if existing_count > 0:
        print(f"WARNING: Collection already has {existing_count} documents")
        response = input("Do you want to DROP existing data and re-seed? (yes/no): ")
        if response.lower() != "yes":
            print("Aborted. No changes made.")
            return
        collection.drop()
        print("Dropped existing collection")
    
    # Transform and insert failure modes
    documents = []
    now = datetime.now(timezone.utc)
    
    for fm in FAILURE_MODES_LIBRARY:
        doc = {
            "legacy_id": fm["id"],  # Keep original ID for reference
            "category": fm["category"],
            "equipment": fm["equipment"],
            "failure_mode": fm["failure_mode"],
            "keywords": fm.get("keywords", []),
            "severity": fm["severity"],
            "occurrence": fm["occurrence"],
            "detectability": fm["detectability"],
            "rpn": fm["rpn"],
            "recommended_actions": fm.get("recommended_actions", []),
            "equipment_type_ids": fm.get("equipment_type_ids", []),
            
            # New ISO 14224 field
            "mechanism": get_mechanism_for_failure_mode(fm["failure_mode"]),
            
            # Validation fields (default to not validated)
            "is_validated": fm.get("is_validated", False),
            "validated_by_name": fm.get("validated_by_name"),
            "validated_by_position": fm.get("validated_by_position"),
            "validated_at": fm.get("validated_at"),
            
            # Metadata
            "is_custom": fm.get("is_custom", False),
            "is_builtin": True,  # Mark all seeded modes as built-in
            "created_at": now,
            "updated_at": now,
        }
        documents.append(doc)
    
    # Insert all documents
    result = collection.insert_many(documents)
    print(f"Successfully inserted {len(result.inserted_ids)} failure modes")
    
    # Create indexes for efficient querying
    collection.create_index("legacy_id", unique=True)
    collection.create_index("category")
    collection.create_index("equipment")
    collection.create_index("failure_mode")
    collection.create_index("equipment_type_ids")
    collection.create_index("mechanism")
    collection.create_index([("keywords", "text"), ("failure_mode", "text"), ("equipment", "text")])
    print("Created indexes")
    
    # Print summary by category
    print("\n--- Summary by Category ---")
    pipeline = [
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    for cat in collection.aggregate(pipeline):
        print(f"  {cat['_id']}: {cat['count']}")
    
    print("\n--- Summary by Mechanism Type ---")
    pipeline = [
        {"$group": {"_id": {"$substr": ["$mechanism", 0, 3]}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    for mech in collection.aggregate(pipeline):
        print(f"  {mech['_id']}: {mech['count']}")
    
    print(f"\nMigration complete! Total: {collection.count_documents({})} failure modes")
    client.close()


if __name__ == "__main__":
    seed_failure_modes()
