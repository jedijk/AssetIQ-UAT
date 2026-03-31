"""
Data Cleanup Script: Fix documents with null 'id' fields.

This script finds all documents in collections that have `id: null` 
and assigns them a proper UUID, allowing unique indexes to be created.

Run this script once to fix legacy data issues.
"""
import asyncio
import uuid
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# Collections that need id field cleanup
COLLECTIONS_TO_FIX = [
    "observations",
    "task_templates",
    "task_plans",
    "task_instances",
    "form_templates",
    "form_submissions",
    "equipment_failure_modes",
]


async def fix_null_ids():
    """Find and fix all documents with id: null."""
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'test_database').strip('"')
    
    if not mongo_url:
        logger.error("MONGO_URL not set")
        return
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    total_fixed = 0
    
    for collection_name in COLLECTIONS_TO_FIX:
        collection = db[collection_name]
        
        # Find documents where id is null or doesn't exist
        query = {"$or": [{"id": None}, {"id": {"$exists": False}}]}
        count = await collection.count_documents(query)
        
        if count == 0:
            logger.info(f"[{collection_name}] No documents with null id found")
            continue
        
        logger.info(f"[{collection_name}] Found {count} documents with null/missing id")
        
        # Update each document with a new UUID
        cursor = collection.find(query)
        fixed = 0
        
        async for doc in cursor:
            new_id = str(uuid.uuid4())
            await collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"id": new_id}}
            )
            fixed += 1
            
            if fixed % 100 == 0:
                logger.info(f"[{collection_name}] Fixed {fixed}/{count} documents...")
        
        logger.info(f"[{collection_name}] Fixed {fixed} documents with new UUIDs")
        total_fixed += fixed
    
    client.close()
    logger.info(f"\n=== Total documents fixed: {total_fixed} ===")
    return total_fixed


async def drop_and_recreate_indexes():
    """Drop problematic indexes and let them be recreated on server restart."""
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'test_database').strip('"')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    for collection_name in COLLECTIONS_TO_FIX:
        collection = db[collection_name]
        try:
            # Try to drop the id_1 index if it exists (it may be partial/broken)
            await collection.drop_index("id_1")
            logger.info(f"[{collection_name}] Dropped id_1 index")
        except Exception as e:
            if "index not found" in str(e).lower():
                logger.info(f"[{collection_name}] No id_1 index to drop")
            else:
                logger.warning(f"[{collection_name}] Error dropping index: {e}")
    
    client.close()


async def main():
    """Run the full cleanup process."""
    logger.info("=== Starting null ID cleanup ===\n")
    
    # Step 1: Fix null IDs
    fixed_count = await fix_null_ids()
    
    if fixed_count and fixed_count > 0:
        # Step 2: Drop broken indexes so they can be recreated
        logger.info("\n=== Dropping broken indexes ===")
        await drop_and_recreate_indexes()
        
        logger.info("\n=== Cleanup complete! ===")
        logger.info("Restart the backend to recreate indexes.")
    else:
        logger.info("\n=== No cleanup needed ===")


if __name__ == "__main__":
    asyncio.run(main())
