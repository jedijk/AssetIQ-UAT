"""
Object Storage Service using Emergent Object Storage.
Handles file uploads for user avatars, attachments, etc.

For Railway/production deployments without Emergent storage,
falls back to storing images in MongoDB as base64.
"""
import os
import uuid
import base64
import logging
import requests
from typing import Tuple, Optional
from dotenv import load_dotenv

# Ensure env vars are loaded
load_dotenv()

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "assetiq"

# Module-level storage key - initialized once and reused
_storage_key: Optional[str] = None
_storage_available: Optional[bool] = None


def _get_emergent_key() -> str:
    """Get the Emergent LLM key from environment."""
    return os.environ.get("EMERGENT_LLM_KEY", "")


def is_storage_available() -> bool:
    """Check if Emergent object storage is available."""
    global _storage_available
    if _storage_available is not None:
        return _storage_available
    
    emergent_key = _get_emergent_key()
    if not emergent_key:
        logger.warning("EMERGENT_LLM_KEY not configured - using MongoDB fallback for file storage")
        _storage_available = False
        return False
    
    try:
        init_storage()
        _storage_available = True
        return True
    except Exception as e:
        logger.warning(f"Emergent storage not available ({e}) - using MongoDB fallback")
        _storage_available = False
        return False


def init_storage() -> str:
    """Initialize storage and get a reusable storage key. Call once at startup."""
    global _storage_key
    if _storage_key:
        return _storage_key
    
    emergent_key = _get_emergent_key()
    if not emergent_key:
        raise ValueError("EMERGENT_LLM_KEY not configured")
    
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": emergent_key},
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
