"""Push realtime events to paired display devices."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from database import AVAILABLE_DATABASES, get_database
from services.visual_display_helpers import DEVICES_COLLECTION
from services.visual_display_ws_hub import display_ws_hub

logger = logging.getLogger(__name__)


async def notify_device(device_id: str, event: str, payload: Optional[Dict[str, Any]] = None) -> None:
    try:
        await display_ws_hub.notify(device_id, event, payload or {})
    except Exception:
        logger.debug("Display WS notify failed for %s", device_id, exc_info=True)


async def notify_devices_for_board(
    board_id: str,
    tenant_id: Optional[str],
    event: str,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    if not board_id:
        return
    query: Dict[str, Any] = {"board_id": board_id}
    if tenant_id:
        query["tenant_id"] = tenant_id

    device_ids: set[str] = set()
    for meta in AVAILABLE_DATABASES.values():
        coll = get_database(meta["name"])[DEVICES_COLLECTION]
        docs = await coll.find(query, {"_id": 0, "id": 1}).to_list(500)
        for doc in docs:
            if doc.get("id"):
                device_ids.add(doc["id"])

    body = payload or {}
    for device_id in device_ids:
        await notify_device(device_id, event, body)
