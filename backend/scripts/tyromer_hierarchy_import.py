"""
Tyromer Equipment Hierarchy Import Script

This script imports the Tyromer equipment hierarchy from the Excel file.
Run this script on the production database to update the hierarchy.

Usage:
    MONGO_URL="mongodb+srv://..." DB_NAME="assetiq" python3 tyromer_hierarchy_import.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
from datetime import datetime, timezone

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "assetiq")

# Equipment hierarchy data from Excel (equipment_hierarchy_20260407_090659.xlsx)
HIERARCHY = {
    "Line-90": {
        "type": "section",
        "children": {
            "Feedstock Prep Unit": {
                "type": "unit",
                "children": {
                    "Crane Subunit": {
                        "type": "subunit",
                        "children": ["Crane Motor", "Crane Chain", "Crane Hook", "Crane Remote"]
                    },
                    "Bunker Subunit": {
                        "type": "subunit",
                        "children": ["Trip Wire", "Rotating Knife Motor", "Rotating Knife Reductor", "Screw Motor", "Screw Reductor", "Transport Screw"]
                    },
                    "Transport 1 Subunit": {
                        "type": "subunit",
                        "children": ["Magnet", "Screw Motorreductor", "Transport Screw"]
                    },
                    "Transport 2 Subunit": {
                        "type": "subunit",
                        "children": ["Screw Motorreductor", "Transport Screw"]
                    }
                }
            },
            "Extrusion Unit": {
                "type": "unit",
                "children": {
                    "Brabender Subunit LIW feeder": {
                        "type": "subunit",
                        "children": ["controll unit", "Motorreductor screw", "shaker"]
                    },
                    "Leistritz Subunit extruder": {
                        "type": "subunit",
                        "children": ["Motor", "Gear box", "safety clutch", "Oilpump and filter", "sensors", "pressure control system"]
                    },
                    "CO2 dosing unit Subunit": {
                        "type": "subunit",
                        "children": ["control unit", "injector"]
                    }
                }
            },
            "Straining Unit": {
                "type": "unit",
                "children": {
                    "UTH Subunit": {
                        "type": "subunit",
                        "children": ["Bearings", "Motor Maindrive", "Gearbox main drive", "Motor reductor TRF", "control unit", "Temperature control system", "Pressure control system", "TCU 1 TRF", "TCU 2 Body / Gears", "TCU 3 Head"]
                    },
                    "Exit conveyor (RTM) Subunit": {
                        "type": "subunit",
                        "children": ["rollers", "Motorreductor"]
                    }
                }
            },
            "Cooling unit": {
                "type": "unit",
                "children": {
                    "Conveyer Belt": {
                        "type": "subunit",
                        "children": ["Conveyer Belt", "Chain", "Bearings", "Motorreductor", "water pump", "Heat exchanger"]
                    },
                    "Conveyer Belt Subunit": {
                        "type": "subunit",
                        "children": ["Belt", "chain", "pnuematic cylinder"]
                    }
                }
            },
            "Drying Mill": {
                "type": "unit",
                "children": {
                    "Drying Mill Subunit": {
                        "type": "subunit",
                        "children": ["Chain", "clamps", "Motorreductor", "Bearings", "Ventilators 1 to 4", "Safety switches doors and hedges (safety)", "pneumatic cylinders", "proximity switches", "control boxes"]
                    }
                }
            },
            "Product Handling Unit": {
                "type": "unit",
                "children": {
                    "outfeed belt Subunit": {
                        "type": "subunit",
                        "children": ["motorreductor", "bearings"]
                    },
                    "accumulator Subunit": {
                        "type": "subunit",
                        "children": ["light curtain safety", "motorreductor", "bearings"]
                    },
                    "Cutter Subunit": {
                        "type": "subunit",
                        "children": ["Knife", "Motorreductor", "Belt", "bearings", "Safety switches doors (safety)", "pnuematic cylinder"]
                    },
                    "Metal Detector Kassel Shark Subunit": {
                        "type": "subunit",
                        "children": ["conveyor belt", "bearings", "motorreductor", "system"]
                    },
                    "Palletizer Subunit": {
                        "type": "subunit",
                        "children": ["Scale", "drive X movement", "drive Z movement", "bearings", "pneumatic cylinders", "light curtain safety", "sensors"]
                    }
                }
            }
        }
    },
    "auxiliar equipment": {
        "type": "section",
        "children": {
            "Offgas Unit": {
                "type": "unit",
                "children": {
                    "Wet Scrubber - Purple Subunit": {
                        "type": "subunit",
                        "children": ["Level Controller", "Water Spray Motor", "Blower"]
                    },
                    "Wet Scrubber - Grey Subunit": {
                        "type": "subunit",
                        "children": ["Level Controller", "Water Spray Motor", "Blower"]
                    },
                    "Particle Filter Subunit": {
                        "type": "subunit",
                        "children": ["Filter", "Internals"]
                    },
                    "Blower Subunit": {
                        "type": "subunit",
                        "children": ["Motor", "Casing"]
                    },
                    "Carbon Filter Subunit": {
                        "type": "subunit",
                        "children": ["Chimney", "PID meter"]
                    }
                }
            },
            "cooling system": {
                "type": "unit",
                "children": {
                    "pump Subunit": {
                        "type": "subunit",
                        "children": ["filter", "valves", "pressure vessel", "control system"]
                    }
                }
            },
            "internal transport": {
                "type": "unit",
                "children": {
                    "forklift Subunit": {
                        "type": "subunit",
                        "children": ["accu charger", "forklift"]
                    },
                    "pallettruck Subunit": {
                        "type": "subunit",
                        "children": ["accu charger", "pallet truck"]
                    }
                }
            }
        }
    }
}


async def import_hierarchy(installation_name: str = "Tyromer", dry_run: bool = False):
    """
    Import the hierarchy into the specified installation.
    
    Args:
        installation_name: Name of the installation to update (case-insensitive)
        dry_run: If True, only show what would be done without making changes
    """
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Find installation
    installation = await db.installations.find_one(
        {"name": {"$regex": f"^{installation_name}$", "$options": "i"}}
    )
    
    if not installation:
        # List available installations
        installations = await db.installations.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        print(f"Installation '{installation_name}' not found!")
        print("\nAvailable installations:")
        for inst in installations:
            print(f"  - {inst['name']}")
        client.close()
        return
    
    installation_id = installation["id"]
    print(f"Found installation: {installation['name']} (id: {installation_id})")
    
    if dry_run:
        print("\n[DRY RUN] Would perform the following actions:")
    
    # Count existing equipment
    existing_count = await db.equipment.count_documents({"installation_id": installation_id})
    print(f"Existing equipment items: {existing_count}")
    
    if not dry_run:
        # Delete existing equipment for this installation
        result = await db.equipment.delete_many({"installation_id": installation_id})
        print(f"Deleted {result.deleted_count} existing equipment items")
    else:
        print(f"[DRY RUN] Would delete {existing_count} existing equipment items")
    
    # Create new equipment items
    equipment_list = []
    sort_order = 0
    
    def create_equipment(name, parent_id, eq_type, level):
        nonlocal sort_order
        sort_order += 1
        return {
            "id": str(uuid.uuid4()),
            "name": name,
            "parent_id": parent_id,
            "installation_id": installation_id,
            "type": eq_type,
            "level": level,
            "sort_order": sort_order,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    
    def process_hierarchy(data, parent_id=None, level=0):
        items = []
        for name, info in data.items():
            if isinstance(info, dict):
                eq_type = info.get("type", "equipment")
                eq = create_equipment(name, parent_id, eq_type, level)
                items.append(eq)
                
                children = info.get("children", {})
                if isinstance(children, dict):
                    items.extend(process_hierarchy(children, eq["id"], level + 1))
                elif isinstance(children, list):
                    for child_name in children:
                        child_eq = create_equipment(child_name, eq["id"], "maintainable_item", level + 1)
                        items.append(child_eq)
        return items
    
    equipment_list = process_hierarchy(HIERARCHY)
    
    if not dry_run:
        # Insert all equipment
        if equipment_list:
            result = await db.equipment.insert_many(equipment_list)
            print(f"Inserted {len(result.inserted_ids)} equipment items")
    else:
        print(f"[DRY RUN] Would insert {len(equipment_list)} equipment items")
    
    # Print hierarchy summary
    print("\n=== Hierarchy Summary ===")
    for eq in equipment_list:
        indent = "  " * eq["level"]
        print(f"{indent}- {eq['name']} ({eq['type']})")
    
    client.close()
    print("\nDone!")


if __name__ == "__main__":
    import sys
    
    # Parse arguments
    installation_name = "Tyromer"
    dry_run = "--dry-run" in sys.argv
    
    for arg in sys.argv[1:]:
        if not arg.startswith("--"):
            installation_name = arg
    
    print(f"Importing hierarchy for: {installation_name}")
    if dry_run:
        print("Running in DRY RUN mode (no changes will be made)")
    
    asyncio.run(import_hierarchy(installation_name, dry_run))
