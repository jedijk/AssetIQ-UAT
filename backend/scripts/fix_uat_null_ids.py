"""
Fix null ID values in UAT database collections.
This script identifies documents with null 'id' fields and assigns them a UUID.

Run this ONLY on the UAT database to prevent duplicate key errors.
"""
import asyncio
import uuid
import os
from motor.motor_asyncio import AsyncIOMotorClient
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Collections that have unique index on 'id' field
COLLECTIONS_WITH_ID_INDEX = [
    "users",
    "equipment_nodes",
    "threats",
    "observations",
    "central_actions",
    "investigations",
    "task_templates",
    "task_plans",
    "task_instances",
    "form_templates",
    "form_submissions",
    "chat_messages",
    "equipment_failure_modes",
    "cause_nodes",
    "timeline_events",
    "action_items",
    "qr_codes",
    "decision_rules",
    "decision_suggestions",
    "failure_identifications",
    "maintenance_strategies",
    "custom_equipment_types",
    "adhoc_plans",
]


async def fix_null_ids(db_name: str = None):
    """Find and fix documents with null id fields."""
    mongo_url = os.environ.get('MONGO_URL')
    if not mongo_url:
        logger.error("MONGO_URL environment variable not set")
        return
    
    # Default to UAT database
    if db_name is None:
        db_name = os.environ.get('DB_NAME', 'assetiq-UAT')
    
    # Safety check - only run on UAT
    if 'UAT' not in db_name and 'uat' not in db_name.lower():
        confirm = input(f"WARNING: This script should only run on UAT databases. Current: {db_name}. Continue? (y/N): ")
        if confirm.lower() != 'y':
            logger.info("Aborted by user")
            return
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    total_fixed = 0
    
    for collection_name in COLLECTIONS_WITH_ID_INDEX:
        collection = db[collection_name]
        
        # Find documents with null id
        null_id_count = await collection.count_documents({"id": None})
        
        if null_id_count > 0:
            logger.info(f"Found {null_id_count} documents with null id in {collection_name}")
            
            # Update each document with a new UUID
            cursor = collection.find({"id": None})
            async for doc in cursor:
                new_id = str(uuid.uuid4())
                await collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"id": new_id}}
                )
                total_fixed += 1
            
            logger.info(f"Fixed {null_id_count} documents in {collection_name}")
    
    # Also check for documents where 'id' field doesn't exist
    for collection_name in COLLECTIONS_WITH_ID_INDEX:
        collection = db[collection_name]
        
        # Find documents where id field is missing
        missing_id_count = await collection.count_documents({"id": {"$exists": False}})
        
        if missing_id_count > 0:
            logger.info(f"Found {missing_id_count} documents with missing id field in {collection_name}")
            
            cursor = collection.find({"id": {"$exists": False}})
            async for doc in cursor:
                new_id = str(uuid.uuid4())
                await collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"id": new_id}}
                )
                total_fixed += 1
            
            logger.info(f"Added id field to {missing_id_count} documents in {collection_name}")
    
    logger.info(f"Total documents fixed: {total_fixed}")
    client.close()
    
    return total_fixed


async def drop_problematic_indexes(db_name: str = None):
    """Drop indexes that might be causing duplicate key errors due to null values."""
    mongo_url = os.environ.get('MONGO_URL')
    if not mongo_url:
        logger.error("MONGO_URL environment variable not set")
        return
    
    if db_name is None:
        db_name = os.environ.get('DB_NAME', 'assetiq-UAT')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    dropped = 0
    
    for collection_name in COLLECTIONS_WITH_ID_INDEX:
        collection = db[collection_name]
        indexes = await collection.index_information()
        
        for idx_name, idx_info in indexes.items():
            # Skip default _id index
            if idx_name == "_id_":
                continue
            
            # Check if it's a unique index on 'id' field
            keys = idx_info.get("key", [])
            is_unique = idx_info.get("unique", False)
            
            if is_unique and any(k == "id" for k, _ in keys):
                # Check if it doesn't have a partial filter
                partial = idx_info.get("partialFilterExpression")
                if not partial:
                    try:
                        await collection.drop_index(idx_name)
                        logger.info(f"Dropped problematic index {idx_name} from {collection_name}")
                        dropped += 1
                    except Exception as e:
                        logger.warning(f"Failed to drop index {idx_name}: {e}")
    
    logger.info(f"Dropped {dropped} problematic indexes")
    client.close()
    
    return dropped


if __name__ == "__main__":
    import sys
    
    # Check for command line argument
    db_name = sys.argv[1] if len(sys.argv) > 1 else "assetiq-UAT"
    
    print(f"Running null ID fix on database: {db_name}")
    
    # First drop problematic indexes
    asyncio.run(drop_problematic_indexes(db_name))
    
    # Then fix null IDs
    asyncio.run(fix_null_ids(db_name))
    
    print("Done! You can now run create_indexes.py to recreate indexes with partial filters.")
