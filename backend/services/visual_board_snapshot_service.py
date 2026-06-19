"""Store and serve high-quality TV display snapshots (static board images)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from database import db
from services.storage_service import get_object_async, put_object_async
from services.tenant_schema import merge_tenant_filter
from services.visual_board_helpers import BOARDS_COLLECTION, VERSIONS_COLLECTION

logger = logging.getLogger(__name__)

MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}


def _snapshot_storage_path(board_id: str, version: int, content_type: str) -> str:
    ext = "jpg" if "jpeg" in content_type or content_type == "image/jpg" else "png"
    if content_type == "image/webp":
        ext = "webp"
    return f"visual-boards/{board_id}/v{version}/display-snapshot.{ext}"


async def store_board_snapshot(
    board_id: str,
    user: dict,
    content: bytes,
    content_type: str,
) -> Dict[str, Any]:
    """Persist a TV snapshot for the board's current published version."""
    if len(content) > MAX_SNAPSHOT_BYTES:
        raise HTTPException(status_code=413, detail="Snapshot exceeds 8 MB limit")
    if not content:
        raise HTTPException(status_code=400, detail="Empty snapshot")

    normalized_type = (content_type or "image/png").split(";")[0].strip().lower()
    if normalized_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Snapshot must be PNG, JPEG, or WebP")

    board = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    version = int(board.get("version") or 1)
    path = _snapshot_storage_path(board_id, version, normalized_type)
    await put_object_async(path, content, normalized_type)

    now = datetime.now(timezone.utc).isoformat()
    meta = {
        "display_snapshot_path": path,
        "display_snapshot_at": now,
        "display_snapshot_content_type": normalized_type,
        "display_snapshot_bytes": len(content),
    }

    version_query = merge_tenant_filter({"board_id": board_id, "version": version}, user)
    await db[VERSIONS_COLLECTION].update_one(version_query, {"$set": meta})
    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board_id}, user),
        {"$set": {**meta, "updated_at": now}},
    )

    logger.info("Stored display snapshot for board %s v%s (%s bytes)", board_id, version, len(content))
    return {"board_id": board_id, "version": version, **meta}


async def _snapshot_meta_for_board(board: dict, version: dict) -> Optional[Dict[str, Any]]:
    path = version.get("display_snapshot_path") or board.get("display_snapshot_path")
    if not path:
        return None
    return {
        "path": path,
        "content_type": version.get("display_snapshot_content_type")
        or board.get("display_snapshot_content_type")
        or "image/png",
        "updated_at": version.get("display_snapshot_at") or board.get("display_snapshot_at"),
    }


async def get_device_snapshot_from_device_doc(device: dict) -> Tuple[bytes, str, Optional[str]]:
    from services.visual_display_device_service import _find_board_for_device

    board, version, _board_db = await _find_board_for_device(device)
    meta = await _snapshot_meta_for_board(board, version)
    if not meta:
        raise HTTPException(
            status_code=404,
            detail="No TV snapshot available yet — publish the board from the designer to generate one",
        )

    try:
        data, content_type = await get_object_async(meta["path"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="TV snapshot file missing") from exc

    return data, meta.get("content_type") or content_type, meta.get("updated_at")
