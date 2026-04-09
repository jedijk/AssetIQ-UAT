"""
MongoDB-based File Storage Service.
Stores all files directly in MongoDB for full portability.

This replaces Emergent Object Storage dependency, allowing the app
to work on any deployment (Railway, Vercel, self-hosted) without
external storage dependencies.

Files are stored in the 'file_storage' collection with:
- path: unique identifier/path
- data: base64 encoded content
- content_type: MIME type
- size: file size in bytes
- created_at: timestamp
"""
import os
import uuid
import base64
import logging
from datetime import datetime, timezone
from typing import Tuple, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Global database reference - set by init_mongo_storage()
_db: Optional[AsyncIOMotorDatabase] = None

# App name for storage paths (kept for backward compatibility)
APP_NAME = "assetiq"

# MIME type helpers
MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "heic": "image/heic",
    "pdf": "application/pdf",
    "json": "application/json",
    "csv": "text/csv",
    "txt": "text/plain",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "mp4": "video/mp4",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
}


def init_mongo_storage(db: AsyncIOMotorDatabase):
    """Initialize the MongoDB storage with database reference."""
    global _db
    _db = db
    logger.info("MongoDB file storage initialized")


def get_mime_type(filename: str) -> str:
    """Get MIME type from filename extension."""
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    return MIME_TYPES.get(ext, "application/octet-stream")


def is_storage_available() -> bool:
    """Check if storage is available - always True for MongoDB storage."""
    return _db is not None


# ==================== ASYNC FUNCTIONS (Primary API) ====================

async def put_object_async(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    """
    Store a file in MongoDB.
    
    Args:
        path: Storage path/identifier (e.g., "attachments/uuid.jpg")
        data: File content as bytes
        content_type: MIME type
    
    Returns:
        dict with path, size, created_at
    """
    if _db is None:
        raise RuntimeError("Storage not initialized - call init_mongo_storage first")
    
    collection = _db["file_storage"]
    
    # Encode to base64 for storage
    base64_data = base64.b64encode(data).decode('utf-8')
    
    now = datetime.now(timezone.utc)
    doc = {
        "path": path,
        "data": base64_data,
        "content_type": content_type,
        "size": len(data),
        "created_at": now,
    }
    
    # Upsert - update if exists, insert if not
    await collection.update_one(
        {"path": path},
        {"$set": doc},
        upsert=True
    )
    
    logger.info(f"Stored file: {path} ({len(data)} bytes, {content_type})")
    
    return {
        "path": path,
        "size": len(data),
        "content_type": content_type,
        "created_at": now.isoformat()
    }


async def get_object_async(path: str) -> Tuple[bytes, str]:
    """
    Retrieve a file from MongoDB.
    
    Args:
        path: Storage path/identifier
    
    Returns:
        Tuple of (content bytes, content_type)
    
    Raises:
        FileNotFoundError if file doesn't exist
    """
    if _db is None:
        raise RuntimeError("Storage not initialized - call init_mongo_storage first")
    
    collection = _db["file_storage"]
    
    doc = await collection.find_one({"path": path})
    
    if not doc:
        logger.warning(f"File not found: {path}")
        raise FileNotFoundError(f"File not found: {path}")
    
    # Decode from base64
    data = base64.b64decode(doc["data"])
    content_type = doc.get("content_type", "application/octet-stream")
    
    return data, content_type


async def delete_object_async(path: str) -> bool:
    """
    Delete a file from MongoDB.
    
    Args:
        path: Storage path/identifier
    
    Returns:
        True if deleted, False if not found
    """
    if _db is None:
        raise RuntimeError("Storage not initialized - call init_mongo_storage first")
    
    collection = _db["file_storage"]
    result = await collection.delete_one({"path": path})
    
    if result.deleted_count > 0:
        logger.info(f"Deleted file: {path}")
        return True
    return False


async def list_objects_async(prefix: str = "", limit: int = 100) -> list:
    """
    List files with optional prefix filter.
    
    Args:
        prefix: Path prefix to filter by
        limit: Maximum number of results
    
    Returns:
        List of file metadata dicts
    """
    if _db is None:
        raise RuntimeError("Storage not initialized - call init_mongo_storage first")
    
    collection = _db["file_storage"]
    
    query = {}
    if prefix:
        query["path"] = {"$regex": f"^{prefix}"}
    
    cursor = collection.find(
        query,
        {"path": 1, "content_type": 1, "size": 1, "created_at": 1, "_id": 0}
    ).limit(limit)
    
    files = []
    async for doc in cursor:
        files.append({
            "path": doc["path"],
            "content_type": doc.get("content_type"),
            "size": doc.get("size"),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None
        })
    
    return files


# ==================== SYNC WRAPPERS (For backward compatibility) ====================

def put_object(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    """
    Synchronous wrapper for put_object_async.
    Works from both sync and async contexts.
    """
    import asyncio
    
    if _db is None:
        raise RuntimeError("Storage not initialized - call init_mongo_storage first")
    
    async def _put():
        return await put_object_async(path, data, content_type)
    
    try:
        # Check if we're in an async context
        asyncio.get_running_loop()
        # We're in async context - create a new thread to run the coroutine
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, _put())
            return future.result(timeout=60)
    except RuntimeError:
        # No running loop - we can use asyncio.run directly
        return asyncio.run(_put())


def get_object(path: str) -> Tuple[bytes, str]:
    """
    Synchronous wrapper for get_object_async.
    Works from both sync and async contexts.
    """
    import asyncio
    
    if _db is None:
        raise RuntimeError("Storage not initialized - call init_mongo_storage first")
    
    async def _get():
        return await get_object_async(path)
    
    try:
        asyncio.get_running_loop()
        # We're in async context - create a new thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, _get())
            return future.result(timeout=60)
    except RuntimeError:
        # No running loop
        return asyncio.run(_get())


# ==================== HELPER FUNCTIONS ====================

def generate_storage_path(category: str, filename: str, user_id: str = None) -> str:
    """
    Generate a unique storage path for a file.
    
    Args:
        category: File category (e.g., "attachments", "avatars")
        filename: Original filename
        user_id: Optional user ID for user-specific files
    
    Returns:
        Unique storage path
    """
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    unique_id = str(uuid.uuid4())
    
    if user_id:
        return f"{category}/{user_id}/{unique_id}.{ext}"
    return f"{category}/{unique_id}.{ext}"


def generate_avatar_path(user_id: str, filename: str) -> str:
    """Generate a unique storage path for a user avatar."""
    return generate_storage_path("avatars", filename, user_id)


async def upload_avatar_async(user_id: str, file_data: bytes, filename: str, content_type: str) -> str:
    """
    Upload a user avatar and return the storage path.
    
    Args:
        user_id: User's ID
        file_data: Image bytes
        filename: Original filename
        content_type: MIME type
    
    Returns:
        Storage path to use for retrieval
    """
    path = generate_avatar_path(user_id, filename)
    await put_object_async(path, file_data, content_type)
    return path


# Legacy sync wrapper
def upload_avatar(user_id: str, file_data: bytes, filename: str, content_type: str) -> str:
    """Sync wrapper for upload_avatar_async."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(upload_avatar_async(user_id, file_data, filename, content_type))
    finally:
        loop.close()


# ==================== MIGRATION UTILITIES ====================

async def get_storage_stats() -> Dict[str, Any]:
    """Get storage statistics."""
    if _db is None:
        return {"error": "Storage not initialized"}
    
    collection = _db["file_storage"]
    
    # Count files
    total_files = await collection.count_documents({})
    
    # Get total size using aggregation
    pipeline = [
        {"$group": {"_id": None, "total_size": {"$sum": "$size"}}}
    ]
    result = await collection.aggregate(pipeline).to_list(length=1)
    total_size = result[0]["total_size"] if result else 0
    
    # Count by category
    category_pipeline = [
        {"$project": {
            "category": {"$arrayElemAt": [{"$split": ["$path", "/"]}, 0]}
        }},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}}
    ]
    categories = await collection.aggregate(category_pipeline).to_list(length=100)
    
    return {
        "total_files": total_files,
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "categories": {cat["_id"]: cat["count"] for cat in categories if cat["_id"]}
    }
