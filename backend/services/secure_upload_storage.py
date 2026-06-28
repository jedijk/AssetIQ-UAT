"""
Secure upload storage: temp/safe/quarantine prefixes with R2 presigned URLs
or direct upload via storage_service fallback.
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple

from config.file_upload_config import (
    SIGNED_URL_EXPIRY_SECONDS,
    STORAGE_PREFIX_QUARANTINE,
    STORAGE_PREFIX_SAFE,
    STORAGE_PREFIX_TEMP,
)
from services.storage_service import (
    _get_r2_client,
    _r2_available,
    _r2_bucket,
    delete_object_async,
    get_object_async,
    put_object_async,
)

logger = logging.getLogger(__name__)


def build_storage_key(prefix: str, tenant_id: str, file_id: str, extension: str) -> str:
    ext = extension.lstrip(".")
    return f"{prefix}{tenant_id}/{file_id}.{ext}"


def temp_key(tenant_id: str, file_id: str, extension: str) -> str:
    return build_storage_key(STORAGE_PREFIX_TEMP, tenant_id, file_id, extension)


def safe_key(tenant_id: str, file_id: str, extension: str) -> str:
    return build_storage_key(STORAGE_PREFIX_SAFE, tenant_id, file_id, extension)


def quarantine_key(tenant_id: str, file_id: str, extension: str) -> str:
    return build_storage_key(STORAGE_PREFIX_QUARANTINE, tenant_id, file_id, extension)


def presigned_put_url(key: str, content_type: str, expiry_seconds: Optional[int] = None) -> Optional[str]:
    if not _r2_available():
        return None
    client = _get_r2_client()
    if not client:
        return None
    try:
        return client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _r2_bucket(),
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expiry_seconds or SIGNED_URL_EXPIRY_SECONDS,
        )
    except Exception as exc:
        logger.warning("presigned PUT URL generation failed: %s", exc)
        return None


def presigned_get_url(key: str, expiry_seconds: Optional[int] = None) -> Optional[str]:
    if not _r2_available():
        return None
    client = _get_r2_client()
    if not client:
        return None
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": _r2_bucket(), "Key": key},
            ExpiresIn=expiry_seconds or SIGNED_URL_EXPIRY_SECONDS,
        )
    except Exception as exc:
        logger.warning("presigned GET URL generation failed: %s", exc)
        return None


async def store_bytes(key: str, data: bytes, content_type: str) -> dict:
    return await put_object_async(key, data, content_type)


async def fetch_bytes(key: str) -> Tuple[bytes, str]:
    return await get_object_async(key)


async def remove_object(key: str) -> bool:
    return await delete_object_async(key)


async def move_object(source_key: str, dest_key: str, content_type: str) -> None:
    data, _ = await fetch_bytes(source_key)
    await store_bytes(dest_key, data, content_type)
    await remove_object(source_key)


def supports_presigned_upload() -> bool:
    return _r2_available()
