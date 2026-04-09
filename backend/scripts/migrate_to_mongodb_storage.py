"""
Migration Script: Move files from Emergent Object Storage to MongoDB

This script migrates all files stored in Emergent Object Storage
to MongoDB's file_storage collection.

Usage:
    python scripts/migrate_to_mongodb_storage.py

The script will:
1. Find all attachments/avatars referenced in the database
2. Download each file from Emergent storage
3. Upload to MongoDB file_storage collection
4. Report migration statistics
"""
import asyncio
import os
import sys
import logging
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import base64

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMERGENT_STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"


async def get_emergent_storage_key():
    """Initialize Emergent storage and get key."""
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        logger.error("EMERGENT_LLM_KEY not set - cannot migrate from Emergent storage")
        return None
    
    try:
        resp = requests.post(
            f"{EMERGENT_STORAGE_URL}/init",
            json={"emergent_key": emergent_key},
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()["storage_key"]
    except Exception as e:
        logger.error(f"Failed to get Emergent storage key: {e}")
        return None


def download_from_emergent(storage_key: str, path: str):
    """Download a file from Emergent storage."""
    try:
        resp = requests.get(
            f"{EMERGENT_STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": storage_key},
            timeout=60
        )
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        return resp.content, content_type
    except Exception as e:
        logger.error(f"Failed to download {path}: {e}")
        return None, None


async def save_to_mongodb(db, path: str, data: bytes, content_type: str):
    """Save a file to MongoDB file_storage collection."""
    collection = db["file_storage"]
    
    base64_data = base64.b64encode(data).decode('utf-8')
    
    doc = {
        "path": path,
        "data": base64_data,
        "content_type": content_type,
        "size": len(data),
        "created_at": datetime.now(timezone.utc),
        "migrated_from": "emergent_storage"
    }
    
    await collection.update_one(
        {"path": path},
        {"$set": doc},
        upsert=True
    )
    return True


async def find_all_storage_paths(db):
    """Find all storage paths referenced in the database."""
    paths = set()
    
    # Check form_submissions for attachments
    async for doc in db["form_submissions"].find({"attachments": {"$exists": True, "$ne": []}}):
        for att in doc.get("attachments", []):
            if att.get("url"):
                paths.add(att["url"])
    
    # Check users for avatars
    async for doc in db["users"].find({"avatar_path": {"$exists": True, "$ne": None}}):
        if doc.get("avatar_path"):
            paths.add(doc["avatar_path"])
    
    # Check central_actions for attachments
    async for doc in db["central_actions"].find({"attachments": {"$exists": True, "$ne": []}}):
        for att in doc.get("attachments", []):
            if att.get("url"):
                paths.add(att["url"])
    
    # Check observations for attachments
    async for doc in db["observations"].find({"attachments": {"$exists": True, "$ne": []}}):
        for att in doc.get("attachments", []):
            if att.get("url"):
                paths.add(att["url"])
    
    # Check task_instances for attachments
    async for doc in db["task_instances"].find({"attachments": {"$exists": True, "$ne": []}}):
        for att in doc.get("attachments", []):
            if att.get("url"):
                paths.add(att["url"])
    
    return paths


async def migrate_files():
    """Main migration function."""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database').strip('"')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Check if there are already files in MongoDB storage
    existing_count = await db["file_storage"].count_documents({})
    logger.info(f"Existing files in MongoDB storage: {existing_count}")
    
    # Get Emergent storage key
    storage_key = await get_emergent_storage_key()
    if not storage_key:
        logger.error("Cannot proceed without Emergent storage access")
        client.close()
        return
    
    # Find all paths to migrate
    logger.info("Scanning database for file references...")
    paths = await find_all_storage_paths(db)
    logger.info(f"Found {len(paths)} unique file paths to check")
    
    # Migrate each file
    migrated = 0
    skipped = 0
    failed = 0
    
    for path in paths:
        # Skip if already in MongoDB
        exists = await db["file_storage"].find_one({"path": path})
        if exists:
            logger.debug(f"Skipping {path} - already in MongoDB")
            skipped += 1
            continue
        
        # Download from Emergent
        logger.info(f"Migrating: {path}")
        data, content_type = download_from_emergent(storage_key, path)
        
        if data:
            # Save to MongoDB
            try:
                await save_to_mongodb(db, path, data, content_type)
                migrated += 1
                logger.info(f"  ✓ Migrated ({len(data)} bytes)")
            except Exception as e:
                logger.error(f"  ✗ Failed to save: {e}")
                failed += 1
        else:
            logger.warning(f"  ✗ Could not download from Emergent")
            failed += 1
    
    # Summary
    logger.info("=" * 50)
    logger.info("MIGRATION COMPLETE")
    logger.info(f"  Migrated: {migrated}")
    logger.info(f"  Skipped (already in MongoDB): {skipped}")
    logger.info(f"  Failed: {failed}")
    logger.info("=" * 50)
    
    # Verify
    final_count = await db["file_storage"].count_documents({})
    logger.info(f"Total files in MongoDB storage: {final_count}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_files())
