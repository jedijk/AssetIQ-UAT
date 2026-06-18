"""Visual display device admin — CRUD, reassignment, token rotation (Phase 4c)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import AVAILABLE_DATABASES, db, get_current_db_name, get_database
from models.visual_display import DeviceEventItem, DisplayDeviceDetail, DisplayDeviceSummary
from services.tenant_schema import merge_tenant_filter
from services.visual_board_helpers import BOARDS_COLLECTION
from services.visual_display_helpers import (
    DEVICES_COLLECTION,
    EVENTS_COLLECTION,
    derive_device_status,
    new_id,
    now_iso,
)
from services.visual_display_notify import notify_device
from services.visual_display_token import generate_device_token

logger = logging.getLogger(__name__)


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _resolution_string(device: dict) -> Optional[str]:
    width = device.get("screen_width")
    height = device.get("screen_height")
    if width and height:
        return f"{width}x{height}"
    return None


def _token_age_days(device: dict) -> Optional[int]:
    issued = device.get("token_issued_at") or device.get("paired_at") or device.get("created_at")
    dt = _parse_iso(issued)
    if not dt:
        return None
    return max(0, int((datetime.now(timezone.utc) - dt).total_seconds() // 86400))


def _uptime_seconds(device: dict) -> Optional[int]:
    online_since = device.get("online_since")
    if online_since:
        dt = _parse_iso(online_since)
        if dt:
            return max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))
    last_seen = device.get("last_seen")
    if not last_seen:
        return None
    if derive_device_status(device) != "online":
        return None
    dt = _parse_iso(last_seen)
    if not dt:
        return None
    return max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))


async def _get_device_for_user(device_id: str, user: dict) -> dict:
    doc = await db[DEVICES_COLLECTION].find_one(
        merge_tenant_filter({"id": device_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Device not found")
    return doc


async def _record_event(
    *,
    device_id: str,
    event: str,
    tenant_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    doc: Dict[str, Any] = {
        "id": new_id("vde"),
        "device_id": device_id,
        "event": event,
        "metadata": metadata or {},
        "timestamp": now_iso(),
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    try:
        await db[EVENTS_COLLECTION].insert_one(doc)
    except Exception:
        logger.debug("Display event insert failed", exc_info=True)


def _board_db_name(database_environment: Optional[str]) -> str:
    if database_environment and database_environment in AVAILABLE_DATABASES:
        return AVAILABLE_DATABASES[database_environment]["name"]
    return get_current_db_name()


async def _fetch_board_meta(
    board_ids: List[str],
    user: dict,
) -> tuple[Dict[str, str], Dict[str, int]]:
    if not board_ids:
        return {}, {}
    names: Dict[str, str] = {}
    versions: Dict[str, int] = {}
    filt = merge_tenant_filter({"id": {"$in": board_ids}}, user)
    boards = await db[BOARDS_COLLECTION].find(
        filt,
        {"_id": 0, "id": 1, "name": 1, "version": 1},
    ).to_list(len(board_ids))
    for board in boards:
        bid = board["id"]
        names[bid] = board.get("name", "")
        versions[bid] = int(board.get("version") or 1)
    return names, versions


def _build_summary(
    device: dict,
    board_names: Dict[str, str],
    board_versions: Dict[str, int],
) -> DisplayDeviceSummary:
    board_id = device.get("board_id")
    board_version = device.get("board_version")
    if board_version is None and board_id:
        board_version = board_versions.get(board_id)
    return DisplayDeviceSummary(
        id=device["id"],
        screen_name=device.get("screen_name", ""),
        board_id=board_id,
        board_name=board_names.get(board_id or ""),
        board_version=board_version,
        location=device.get("location") or None,
        area=device.get("area") or None,
        status=derive_device_status(device),
        last_seen=device.get("last_seen"),
        user_agent=device.get("user_agent"),
        screen_width=device.get("screen_width"),
        screen_height=device.get("screen_height"),
        resolution=_resolution_string(device),
        uptime_seconds=_uptime_seconds(device),
        token_age_days=_token_age_days(device),
        created_at=device.get("created_at"),
        paired_at=device.get("paired_at"),
    )


async def get_device_detail(device_id: str, user: dict) -> DisplayDeviceDetail:
    device = await _get_device_for_user(device_id, user)
    board_names, board_versions = await _fetch_board_meta(
        [device["board_id"]] if device.get("board_id") else [],
        user,
    )
    summary = _build_summary(device, board_names, board_versions)
    return DisplayDeviceDetail(
        **summary.model_dump(),
        device_fingerprint=device.get("device_fingerprint"),
        device_label=device.get("device_label"),
        pairing_id=device.get("pairing_id"),
        token_rotation_pending=bool(device.get("pending_delivery_token")),
        disabled_at=device.get("disabled_at"),
        updated_at=device.get("updated_at"),
    )


async def update_device(
    device_id: str,
    user: dict,
    *,
    screen_name: Optional[str] = None,
    location: Optional[str] = None,
    area: Optional[str] = None,
) -> DisplayDeviceDetail:
    device = await _get_device_for_user(device_id, user)
    updates: Dict[str, Any] = {"updated_at": now_iso()}
    if screen_name is not None:
        name = screen_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="screen_name cannot be empty")
        updates["screen_name"] = name
    if location is not None:
        updates["location"] = location
    if area is not None:
        updates["area"] = area

    await db[DEVICES_COLLECTION].update_one(
        merge_tenant_filter({"id": device_id}, user),
        {"$set": updates},
    )
    device.update(updates)
    await _record_event(
        device_id=device_id,
        event="updated",
        tenant_id=device.get("tenant_id"),
        metadata={k: updates[k] for k in ("screen_name", "location", "area") if k in updates},
    )
    return await get_device_detail(device_id, user)


async def reassign_board(
    device_id: str,
    user: dict,
    board_id: str,
    database_environment: Optional[str] = None,
) -> DisplayDeviceDetail:
    device = await _get_device_for_user(device_id, user)
    board_db_name = _board_db_name(database_environment)
    board_coll = get_database(board_db_name)[BOARDS_COLLECTION]
    board = await board_coll.find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1, "name": 1, "status": 1, "version": 1},
    )
    if not board:
        raise HTTPException(
            status_code=404,
            detail="Board not found — select a board from the list or create one under Boards",
        )

    now = now_iso()
    board_version = int(board.get("version") or 1)
    await db[DEVICES_COLLECTION].update_one(
        merge_tenant_filter({"id": device_id}, user),
        {
            "$set": {
                "board_id": board_id,
                "board_version": board_version,
                "updated_at": now,
            }
        },
    )
    await _record_event(
        device_id=device_id,
        event="board_reassigned",
        tenant_id=device.get("tenant_id"),
        metadata={"board_id": board_id, "board_name": board.get("name"), "board_version": board_version},
    )
    await notify_device(
        device_id,
        "board_reassigned",
        {"board_id": board_id, "board_version": board_version},
    )
    return await get_device_detail(device_id, user)


async def disable_device(device_id: str, user: dict) -> DisplayDeviceDetail:
    device = await _get_device_for_user(device_id, user)
    if device.get("status") == "disabled":
        return await get_device_detail(device_id, user)

    now = now_iso()
    await db[DEVICES_COLLECTION].update_one(
        merge_tenant_filter({"id": device_id}, user),
        {"$set": {"status": "disabled", "disabled_at": now, "updated_at": now}},
    )
    await _record_event(
        device_id=device_id,
        event="disabled",
        tenant_id=device.get("tenant_id"),
    )
    await notify_device(device_id, "device_disabled", {})
    return await get_device_detail(device_id, user)


async def enable_device(device_id: str, user: dict) -> DisplayDeviceDetail:
    device = await _get_device_for_user(device_id, user)
    if device.get("status") != "disabled":
        return await get_device_detail(device_id, user)

    now = now_iso()
    await db[DEVICES_COLLECTION].update_one(
        merge_tenant_filter({"id": device_id}, user),
        {
            "$set": {"status": "active", "updated_at": now},
            "$unset": {"disabled_at": ""},
        },
    )
    await _record_event(
        device_id=device_id,
        event="enabled",
        tenant_id=device.get("tenant_id"),
    )
    return await get_device_detail(device_id, user)


async def rotate_device_token(device_id: str, user: dict) -> Dict[str, Any]:
    device = await _get_device_for_user(device_id, user)
    if device.get("status") == "disabled":
        raise HTTPException(status_code=400, detail="Cannot rotate token for a disabled device")

    raw_token, pending_hash = generate_device_token()
    now = now_iso()
    await db[DEVICES_COLLECTION].update_one(
        merge_tenant_filter({"id": device_id}, user),
        {
            "$set": {
                "pending_delivery_token": raw_token,
                "pending_token_hash": pending_hash,
                "updated_at": now,
            }
        },
    )
    await _record_event(
        device_id=device_id,
        event="token_rotation_started",
        tenant_id=device.get("tenant_id"),
    )
    await notify_device(device_id, "token_rotated", {"rotation_pending": True})
    return {"device_id": device_id, "rotation_pending": True}


async def accept_token_rotation(raw_token: str) -> Dict[str, Any]:
    """Device accepts pending token rotation using its current (old) token."""
    from services.visual_display_device_service import lookup_device_by_token

    device = await lookup_device_by_token(raw_token)
    pending = device.get("pending_delivery_token")
    pending_hash = device.get("pending_token_hash")
    if not pending or not pending_hash:
        raise HTTPException(status_code=400, detail="No token rotation pending")

    now = now_iso()
    await db[DEVICES_COLLECTION].update_one(
        {"id": device["id"]},
        {
            "$set": {
                "token_hash": pending_hash,
                "token_issued_at": now,
                "updated_at": now,
            },
            "$unset": {"pending_delivery_token": "", "pending_token_hash": ""},
        },
    )
    await _record_event(
        device_id=device["id"],
        event="token_rotated",
        tenant_id=device.get("tenant_id"),
    )
    return {"device_id": device["id"], "device_token": pending}


async def delete_device(device_id: str, user: dict) -> None:
    device = await _get_device_for_user(device_id, user)
    await db[DEVICES_COLLECTION].delete_one(merge_tenant_filter({"id": device_id}, user))
    await _record_event(
        device_id=device_id,
        event="deleted",
        tenant_id=device.get("tenant_id"),
    )


async def list_device_events(device_id: str, user: dict, *, limit: int = 50) -> Dict[str, Any]:
    await _get_device_for_user(device_id, user)
    limit = max(1, min(limit, 200))
    events = await db[EVENTS_COLLECTION].find(
        merge_tenant_filter({"device_id": device_id}, user),
        {"_id": 0},
    ).sort("timestamp", -1).to_list(limit)
    items = [
        DeviceEventItem(
            id=e["id"],
            event=e.get("event", ""),
            timestamp=e.get("timestamp", ""),
            metadata=e.get("metadata") or {},
        ).model_dump()
        for e in events
    ]
    return {"items": items, "total": len(items)}


async def list_display_devices_enhanced(user: dict) -> Dict[str, Any]:
    """List paired display devices with board version, resolution, uptime, token age."""
    devices = await db[DEVICES_COLLECTION].find(
        merge_tenant_filter({}, user),
        {"_id": 0, "token_hash": 0, "pending_delivery_token": 0, "pending_token_hash": 0},
    ).sort("created_at", -1).to_list(500)

    board_ids = list({d.get("board_id") for d in devices if d.get("board_id")})
    board_names, board_versions = await _fetch_board_meta(board_ids, user)

    items = [
        _build_summary(d, board_names, board_versions).model_dump()
        for d in devices
    ]
    return {"items": items, "total": len(items)}
