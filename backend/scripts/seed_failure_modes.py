"""
Seed Failure Modes from Static Library to MongoDB.
This ensures all failure modes have proper versioning support.
"""

import asyncio
import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


async def seed_failure_modes_library(db: AsyncIOMotorDatabase, force_reseed: bool = False) -> Dict[str, Any]:
    """
    Seed the failure_modes MongoDB collection from the static FAILURE_MODES_LIBRARY.
    Applies ISO 14224 enhancements (mechanism, potential_effects, potential_causes).
    
    Args:
        db: MongoDB database instance
        force_reseed: If True, will re-seed even if data exists. If False, skips if data exists.
    
    Returns:
        Dict with seeding results (inserted count, skipped, errors)
    """
    from failure_modes import FAILURE_MODES_LIBRARY
    from scripts.enhance_failure_modes import get_enhancement, ISO_MECHANISMS
    
    collection = db["failure_modes"]
    
    # Check existing count
    existing_count = await collection.count_documents({})
    
    if existing_count > 0 and not force_reseed:
        logger.info(f"Failure modes already seeded ({existing_count} documents). Skipping.")
        return {
            "status": "skipped",
            "existing_count": existing_count,
            "message": "Collection already has data. Use force_reseed=True to overwrite."
        }
    
    # If force_reseed, clear the collection first
    if force_reseed and existing_count > 0:
        logger.info(f"Force reseed: Clearing {existing_count} existing failure modes")
        await collection.delete_many({})
    
    # Prepare documents for insertion
    now = datetime.now(timezone.utc)
    documents = []
    
    for fm in FAILURE_MODES_LIBRARY:
        # Get ISO 14224 enhancements for this failure mode
        enhancement = get_enhancement(fm.get("failure_mode", ""))
        mechanism_code = enhancement.get("mechanism", "UNK")
        mechanism_desc = ISO_MECHANISMS.get(mechanism_code, "Unknown")
        
        doc = {
            "legacy_id": fm["id"],  # Keep original ID as legacy_id
            "category": fm.get("category", ""),
            "equipment": fm.get("equipment", ""),
            "failure_mode": fm.get("failure_mode", ""),
            "keywords": fm.get("keywords", []),
            "severity": fm.get("severity", 5),
            "occurrence": fm.get("occurrence", 5),
            "detectability": fm.get("detectability", 5),
            "rpn": fm.get("rpn", 125),
            "recommended_actions": fm.get("recommended_actions", []),
            "equipment_type_ids": fm.get("equipment_type_ids", []),
            # ISO 14224 enhanced fields
            "mechanism": mechanism_code,
            "mechanism_description": mechanism_desc,
            "potential_effects": enhancement.get("potential_effects", []),
            "potential_causes": enhancement.get("potential_causes", []),
            # Versioning
            "version": 1,
            "is_validated": False,
            "validated_by_name": None,
            "validated_by_position": None,
            "validated_by_id": None,
            "validated_at": None,
            # Metadata
            "is_custom": False,
            "is_builtin": True,
            "created_by": "system",
            "created_at": now,
            "updated_at": now,
        }
        documents.append(doc)
    
    # Insert all documents
    try:
        if documents:
            result = await collection.insert_many(documents)
            inserted_count = len(result.inserted_ids)
            logger.info(f"Seeded {inserted_count} failure modes from static library")
            
            # Create indexes for efficient lookups
            await collection.create_index("legacy_id", unique=True, sparse=True)
            await collection.create_index("failure_mode")
            await collection.create_index("category")
            await collection.create_index("rpn")
            await collection.create_index("equipment_type_ids")
            
            return {
                "status": "success",
                "inserted_count": inserted_count,
                "message": f"Successfully seeded {inserted_count} failure modes"
            }
        else:
            return {
                "status": "error",
                "message": "No failure modes found in static library"
            }
    except Exception as e:
        logger.error(f"Error seeding failure modes: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


async def ensure_failure_modes_seeded(db: AsyncIOMotorDatabase) -> bool:
    """
    Ensure failure modes are seeded. Called on app startup.
    Returns True if data is available (either already existed or just seeded).
    """
    result = await seed_failure_modes_library(db, force_reseed=False)
    return result["status"] in ["success", "skipped"]


# CLI runner
if __name__ == "__main__":
    import os
    import sys
    from pathlib import Path
    
    # Add parent directory to path for imports
    sys.path.insert(0, str(Path(__file__).parent.parent))
    
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / '.env')
    
    from motor.motor_asyncio import AsyncIOMotorClient
    
    async def main():
        mongo_url = os.environ.get('MONGO_URL')
        db_name = os.environ.get('DB_NAME', 'threatbase')
        
        if not mongo_url:
            print("ERROR: MONGO_URL not set")
            return
        
        print(f"Connecting to MongoDB...")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        
        # Check for --force flag
        force = '--force' in sys.argv
        
        print(f"Seeding failure modes (force={force})...")
        result = await seed_failure_modes_library(db, force_reseed=force)
        print(f"Result: {result}")
        
        client.close()
    
    asyncio.run(main())
