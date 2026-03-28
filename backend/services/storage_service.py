"""
Object Storage Service using Emergent Object Storage.
Handles file uploads for user avatars, attachments, etc.
"""
import os
import uuid
import logging
import requests
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "assetiq"

# Module-level storage key - initialized once and reused
_storage_key: Optional[str] = None


def init_storage() -> str:
    """Initialize storage and get a reusable storage key. Call once at startup."""
    global _storage_key
    if _storage_key:
        return _storage_key
    
    if not EMERGENT_KEY:
        raise ValueError("EMERGENT_LLM_KEY not configured")
    
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30
        )
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        logger.info("Storage service initialized successfully")
        return _storage_key
    except Exception as e:
        logger.error(f"Failed to initialize storage: {e}")
        raise


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """
    Upload a file to object storage.
    
    Args:
        path: Storage path (e.g., "assetiq/avatars/user-id/uuid.png")
        data: File content as bytes
        content_type: MIME type (e.g., "image/png")
    
    Returns:
        dict with path, size, etag
    """
    key = init_storage()
    
    try:
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={
                "X-Storage-Key": key,
                "Content-Type": content_type
            },
            data=data,
            timeout=120
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to upload object to {path}: {e}")
        raise


def get_object(path: str) -> Tuple[bytes, str]:
    """
    Download a file from object storage.
    
    Args:
        path: Storage path
    
    Returns:
        Tuple of (content bytes, content_type)
    """
    key = init_storage()
    
    try:
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60
        )
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        return resp.content, content_type
    except Exception as e:
        logger.error(f"Failed to get object from {path}: {e}")
        raise


# MIME type helpers
MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "json": "application/json",
    "csv": "text/csv",
    "txt": "text/plain"
}


def get_mime_type(filename: str) -> str:
    """Get MIME type from filename extension."""
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    return MIME_TYPES.get(ext, "application/octet-stream")


def generate_avatar_path(user_id: str, filename: str) -> str:
    """Generate a unique storage path for a user avatar."""
    ext = filename.split(".")[-1].lower() if "." in filename else "png"
    unique_id = str(uuid.uuid4())
    return f"{APP_NAME}/avatars/{user_id}/{unique_id}.{ext}"


def upload_avatar(user_id: str, file_data: bytes, filename: str, content_type: str) -> str:
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
    result = put_object(path, file_data, content_type)
    return result["path"]
