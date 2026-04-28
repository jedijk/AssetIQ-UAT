"""
Dual Storage Service: Cloudflare R2 (primary) + MongoDB (legacy fallback).

NEW uploads → R2 (stores file in R2, metadata-only in MongoDB)
EXISTING files → MongoDB base64 (backward compatible, no migration needed)

Environment variables for R2:
- R2_ACCESS_KEY
- R2_SECRET_KEY
- R2_BUCKET
- R2_ENDPOINT
"""
import os
import uuid
import base64
import logging
from datetime import datetime, timezone
from typing import Tuple, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

APP_NAME = "assetiq"

# ==================== R2 CLIENT (lazy init) ====================

_r2_client = None

def _get_r2_client():
    """Lazy-init boto3 S3 client for Cloudflare R2."""
    global _r2_client
    if _r2_client is not None:
        return _r2_client

    access_key = os.environ.get("R2_ACCESS_KEY")
    secret_key = os.environ.get("R2_SECRET_KEY")
    endpoint = os.environ.get("R2_ENDPOINT")

    if not all([access_key, secret_key, endpoint]):
        logger.warning("R2 credentials not configured — falling back to MongoDB storage")
        return None

    import boto3
    _r2_client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )
    logger.info("R2 storage client initialized")
    return _r2_client


def _r2_bucket() -> str:
    return os.environ.get("R2_BUCKET", "assetiq-files")


def _r2_available() -> bool:
    """Check if R2 is configured and reachable."""
    return _get_r2_client() is not None


# ==================== MONGODB CONNECTION (legacy) ====================

_storage_client: Optional[AsyncIOMotorClient] = None
_storage_db = None  # fallback-only cache (non-request contexts)


async def _get_storage_db():
    """
    Get the database for file_storage metadata.

    IMPORTANT:
    This app supports per-request database switching via `database.py` using a ContextVar
    set from the `X-Database-Environment` header. For correctness, `file_storage` metadata
    must live in the SAME database as the request-scoped application data (e.g. `equipment_files`).

    Therefore we prefer the request-scoped DB from `database.get_request_db()`.
    We keep the legacy AsyncIOMotorClient path as a fallback (mainly for scripts/background
    contexts where the request DB context may not be initialized).
    """
    global _storage_client, _storage_db

    # Prefer the app's request-scoped DB (supports multi-environment switching).
    # IMPORTANT: do NOT cache this globally — request DB changes per request/env.
    try:
        from database import get_request_db
        return get_request_db()
    except Exception as e:
        # Non-request contexts (scripts/background tasks) fall back to a standalone client.
        logger.warning(f"Falling back to standalone storage DB client: {e}")

    if _storage_db is not None:
        return _storage_db

    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'test_database').strip('"')

    if not mongo_url:
        raise RuntimeError("MONGO_URL not configured")

    _storage_client = AsyncIOMotorClient(
        mongo_url,
        serverSelectionTimeoutMS=10000,
        connectTimeoutMS=10000,
        socketTimeoutMS=30000,
        maxPoolSize=5,
        retryReads=True,
        retryWrites=True,
    )
    _storage_db = _storage_client[db_name]
    logger.info("File storage DB connection initialized")
    return _storage_db


def _get_db():
    from database import db
    return db


# ==================== MIME TYPES ====================

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "heic": "image/heic",
    "pdf": "application/pdf", "json": "application/json",
    "csv": "text/csv", "txt": "text/plain",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "mp4": "video/mp4", "mp3": "audio/mpeg", "wav": "audio/wav",
}


def init_mongo_storage(db=None):
    logger.info("MongoDB file storage initialized")


def get_mime_type(filename: str) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    return MIME_TYPES.get(ext, "application/octet-stream")


def is_storage_available() -> bool:
    return True


# ==================== ASYNC PRIMARY API ====================

async def put_object_async(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    """
    Store a file. Uses R2 if available, otherwise falls back to MongoDB base64.

    R2 path: uploads file to R2, stores metadata-only in MongoDB.
    MongoDB path: stores base64-encoded data (legacy).
    """
    now = datetime.now(timezone.utc)
    db = await _get_storage_db()
    collection = db["file_storage"]

    # --- R2 PRIMARY PATH ---
    if _r2_available():
        try:
            client = _get_r2_client()
            bucket = _r2_bucket()

            client.put_object(
                Bucket=bucket,
                Key=path,
                Body=data,
                ContentType=content_type,
            )

            # Store metadata-only in MongoDB (NO base64 data)
            doc = {
                "path": path,
                "storage_type": "r2",
                "content_type": content_type,
                "size": len(data),
                "created_at": now,
                # No "data" field — file is in R2
            }
            await collection.update_one({"path": path}, {"$set": doc}, upsert=True)

            logger.info(f"[R2] Stored: {path} ({len(data)} bytes)")
            return {"path": path, "size": len(data), "content_type": content_type,
                    "storage_type": "r2", "created_at": now.isoformat()}

        except Exception as e:
            logger.error(f"[R2] Upload failed for {path}, falling back to MongoDB: {e}")
            # Fall through to MongoDB

    # --- MONGODB FALLBACK ---
    base64_data = base64.b64encode(data).decode('utf-8')
    doc = {
        "path": path,
        "data": base64_data,
        "storage_type": "mongodb",
        "content_type": content_type,
        "size": len(data),
        "created_at": now,
    }
    await collection.update_one({"path": path}, {"$set": doc}, upsert=True)

    logger.info(f"[MongoDB] Stored: {path} ({len(data)} bytes)")
    return {"path": path, "size": len(data), "content_type": content_type,
            "storage_type": "mongodb", "created_at": now.isoformat()}


async def get_object_async(path: str) -> Tuple[bytes, str]:
    """
    Retrieve a file. Checks storage_type to decide R2 vs MongoDB.

    R2 files: fetched directly from R2.
    Legacy files: decoded from base64 in MongoDB.
    """
    import asyncio

    try:
        db = await asyncio.wait_for(_get_storage_db(), timeout=10.0)
        collection = db["file_storage"]
        doc = await asyncio.wait_for(collection.find_one({"path": path}), timeout=15.0)
    except asyncio.TimeoutError:
        logger.error(f"Timeout fetching file metadata: {path}")
        raise FileNotFoundError(f"Timeout fetching file: {path}")
    except Exception as e:
        logger.error(f"Error fetching file {path}: {e}")
        raise FileNotFoundError(f"Error fetching file: {path}")

    if not doc:
        raise FileNotFoundError(f"File not found: {path}")

    content_type = doc.get("content_type", "application/octet-stream")
    storage_type = doc.get("storage_type", "mongodb")

    # --- R2 PATH ---
    if storage_type == "r2" and _r2_available():
        try:
            client = _get_r2_client()
            resp = client.get_object(Bucket=_r2_bucket(), Key=path)
            data = resp["Body"].read()
            logger.info(f"[R2] Retrieved: {path} ({len(data)} bytes)")
            return data, content_type
        except Exception as e:
            logger.error(f"[R2] Retrieval failed for {path}: {e}")
            # If the doc also has base64 data (shouldn't for R2), try that
            if doc.get("data"):
                logger.info(f"[R2→MongoDB fallback] Using base64 data for {path}")
                return base64.b64decode(doc["data"]), content_type
            raise FileNotFoundError(f"R2 retrieval failed: {path}")

    # --- MONGODB LEGACY PATH ---
    if not doc.get("data"):
        raise FileNotFoundError(f"No file data for: {path}")

    data = base64.b64decode(doc["data"])
    return data, content_type


async def delete_object_async(path: str) -> bool:
    """
    Delete a file. Removes from R2 if applicable, always removes MongoDB record.
    """
    db = await _get_storage_db()
    collection = db["file_storage"]

    doc = await collection.find_one({"path": path}, {"storage_type": 1})

    # --- R2 deletion ---
    if doc and doc.get("storage_type") == "r2" and _r2_available():
        try:
            client = _get_r2_client()
            client.delete_object(Bucket=_r2_bucket(), Key=path)
            logger.info(f"[R2] Deleted: {path}")
        except Exception as e:
            logger.error(f"[R2] Delete failed for {path}: {e}")

    # --- Always remove MongoDB record ---
    result = await collection.delete_one({"path": path})
    if result.deleted_count > 0:
        logger.info(f"[MongoDB] Deleted record: {path}")
        return True
    return False


async def list_objects_async(prefix: str = "", limit: int = 100) -> list:
    db = await _get_storage_db()
    collection = db["file_storage"]

    query = {}
    if prefix:
        query["path"] = {"$regex": f"^{prefix}"}

    cursor = collection.find(
        query,
        {"path": 1, "content_type": 1, "size": 1, "created_at": 1, "storage_type": 1, "_id": 0}
    ).limit(limit)

    files = []
    async for doc in cursor:
        files.append({
            "path": doc["path"],
            "content_type": doc.get("content_type"),
            "size": doc.get("size"),
            "storage_type": doc.get("storage_type", "mongodb"),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        })
    return files


# ==================== SYNC WRAPPERS (backward compatibility) ====================

def put_object(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    import asyncio
    async def _put():
        return await put_object_async(path, data, content_type)
    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, _put())
            return future.result(timeout=120)
    except RuntimeError:
        return asyncio.run(_put())


def get_object(path: str) -> Tuple[bytes, str]:
    import asyncio
    async def _get():
        return await get_object_async(path)
    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, _get())
            return future.result(timeout=120)
    except RuntimeError:
        return asyncio.run(_get())


# ==================== HELPERS ====================

def generate_storage_path(category: str, filename: str, user_id: str = None) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    unique_id = str(uuid.uuid4())
    if user_id:
        return f"{category}/{user_id}/{unique_id}.{ext}"
    return f"{category}/{unique_id}.{ext}"


def generate_avatar_path(user_id: str, filename: str) -> str:
    return generate_storage_path("avatars", filename, user_id)


async def upload_avatar_async(user_id: str, file_data: bytes, filename: str, content_type: str) -> str:
    path = generate_avatar_path(user_id, filename)
    await put_object_async(path, file_data, content_type)
    return path


def upload_avatar(user_id: str, file_data: bytes, filename: str, content_type: str) -> str:
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(upload_avatar_async(user_id, file_data, filename, content_type))
    finally:
        loop.close()


# ==================== STORAGE STATS ====================

async def get_storage_stats() -> Dict[str, Any]:
    try:
        db = await _get_storage_db()
    except Exception as e:
        return {"error": f"Storage not initialized: {e}"}

    collection = db["file_storage"]
    total_files = await collection.count_documents({})

    pipeline = [{"$group": {"_id": None, "total_size": {"$sum": "$size"}}}]
    result = await collection.aggregate(pipeline).to_list(length=1)
    total_size = result[0]["total_size"] if result else 0

    type_pipeline = [
        {"$group": {"_id": {"$ifNull": ["$storage_type", "mongodb"]}, "count": {"$sum": 1}, "size": {"$sum": "$size"}}}
    ]
    types = await collection.aggregate(type_pipeline).to_list(length=10)

    category_pipeline = [
        {"$project": {"category": {"$arrayElemAt": [{"$split": ["$path", "/"]}, 0]}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}}
    ]
    categories = await collection.aggregate(category_pipeline).to_list(length=100)

    return {
        "total_files": total_files,
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "by_storage_type": {t["_id"]: {"count": t["count"], "size_mb": round(t["size"] / (1024*1024), 2)} for t in types},
        "by_category": {cat["_id"]: cat["count"] for cat in categories if cat["_id"]},
        "r2_configured": _r2_available(),
    }
