"""
Scheduled cleanup for secure upload pipeline.

- Abandoned temp uploads older than temp_retention_hours
- Quarantined files older than quarantine_retention_days
- Temp objects after successful processing (orphan keys)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from config.file_upload_config import UploadStatus
from database import db
from services.secure_upload_storage import remove_object

logger = logging.getLogger(__name__)

COLLECTION = "uploaded_files"

_ABANDONED_STATUSES = {
    UploadStatus.INITIATED.value,
    UploadStatus.UPLOADING.value,
    UploadStatus.UPLOADED.value,
}


async def run_upload_cleanup(
    *,
    temp_retention_hours: int = 2,
    quarantine_retention_days: int = 30,
    dry_run: bool = False,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    temp_cutoff = (now - timedelta(hours=temp_retention_hours)).isoformat()
    quarantine_cutoff = (now - timedelta(days=quarantine_retention_days)).isoformat()

    stats = {
        "abandoned_temp_deleted": 0,
        "quarantine_deleted": 0,
        "errors": 0,
        "dry_run": dry_run,
    }

    abandoned_cursor = db[COLLECTION].find(
        {
            "status": {"$in": list(_ABANDONED_STATUSES)},
            "created_at": {"$lt": temp_cutoff},
        },
        {"_id": 0, "id": 1, "storage_key": 1, "safe_storage_key": 1, "quarantine_storage_key": 1},
    )

    async for doc in abandoned_cursor:
        if not dry_run:
            for key in (doc.get("storage_key"), doc.get("safe_storage_key"), doc.get("quarantine_storage_key")):
                if key:
                    try:
                        await remove_object(key)
                    except Exception as exc:
                        logger.warning("cleanup remove %s: %s", key, exc)
                        stats["errors"] += 1
            await db[COLLECTION].update_one(
                {"id": doc["id"]},
                {"$set": {
                    "status": UploadStatus.DELETED.value,
                    "updated_at": now.isoformat(),
                    "deleted_at": now.isoformat(),
                    "rejection_reason": "Abandoned upload expired",
                }},
            )
        stats["abandoned_temp_deleted"] += 1

    quarantine_cursor = db[COLLECTION].find(
        {
            "status": UploadStatus.QUARANTINED.value,
            "updated_at": {"$lt": quarantine_cutoff},
        },
        {"_id": 0, "id": 1, "quarantine_storage_key": 1, "storage_key": 1},
    )

    async for doc in quarantine_cursor:
        if not dry_run:
            for key in (doc.get("quarantine_storage_key"), doc.get("storage_key")):
                if key:
                    try:
                        await remove_object(key)
                    except Exception as exc:
                        logger.warning("quarantine cleanup remove %s: %s", key, exc)
                        stats["errors"] += 1
            await db[COLLECTION].update_one(
                {"id": doc["id"]},
                {"$set": {
                    "status": UploadStatus.DELETED.value,
                    "updated_at": now.isoformat(),
                    "deleted_at": now.isoformat(),
                }},
            )
        stats["quarantine_deleted"] += 1

    logger.info("upload cleanup complete: %s", stats)
    return stats
