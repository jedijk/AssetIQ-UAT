"""Visual display device runtime — token auth, connect, heartbeat, board read APIs (Phase 4b)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from database import AVAILABLE_DATABASES, db, get_current_db_name, get_database, set_request_db
from models.visual_board import BoardStatus, VisualBoardHeaderConfig
from services.visual_board_data_service import (
    get_public_data_from_context,
    get_public_layout_from_context,
)
from services.visual_board_helpers import BOARDS_COLLECTION, VERSIONS_COLLECTION
from services.visual_display_helpers import (
    DEVICES_COLLECTION,
    EVENTS_COLLECTION,
    derive_device_status,
    new_id,
    now_iso,
)
from services.visual_display_token import hash_device_token, normalize_device_token, validate_device_token_format

logger = logging.getLogger(__name__)

DEVICE_TOKEN_SCHEME = "devicetoken"


def extract_device_token(request: Request) -> Optional[str]:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith(f"{DEVICE_TOKEN_SCHEME} "):
        return auth[len(DEVICE_TOKEN_SCHEME) + 1 :].strip()
    header_token = (request.headers.get("x-device-token") or "").strip()
    return header_token or None


def _device_lookup_db_names() -> list[str]:
    names: list[str] = []
    for candidate in (get_current_db_name(), *[m["name"] for m in AVAILABLE_DATABASES.values()]):
        if candidate and candidate not in names:
            names.append(candidate)
    return names


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


async def _find_board_for_device(device: dict) -> tuple[dict, dict, str]:
    """Load board + version snapshot, searching across DBs when needed."""
    board_id = device.get("board_id")
    if not board_id:
        raise HTTPException(status_code=404, detail="No board assigned to this device")

    tenant_id = device.get("tenant_id")
    board_query: Dict[str, Any] = {"id": board_id}
    if tenant_id:
        board_query["tenant_id"] = tenant_id

    db_names: list[str] = []
    env_key = device.get("board_database_environment")
    if env_key and env_key in AVAILABLE_DATABASES:
        db_names.append(AVAILABLE_DATABASES[env_key]["name"])
    current = get_current_db_name()
    if current and current not in db_names:
        db_names.append(current)
    for meta in AVAILABLE_DATABASES.values():
        if meta["name"] not in db_names:
            db_names.append(meta["name"])

    board = None
    board_db_name = None
    for db_name in db_names:
        found = await get_database(db_name)[BOARDS_COLLECTION].find_one(board_query, {"_id": 0})
        if found:
            board = found
            board_db_name = db_name
            break

    if not board or not board_db_name:
        raise HTTPException(status_code=404, detail="Assigned board not found")

    if board.get("status") == BoardStatus.ARCHIVED.value:
        raise HTTPException(status_code=403, detail="Assigned board is archived")

    version_num = int(board.get("version") or 1)
    version_query: Dict[str, Any] = {"board_id": board_id, "version": version_num}
    if tenant_id:
        version_query["tenant_id"] = tenant_id
    version = await get_database(board_db_name)[VERSIONS_COLLECTION].find_one(version_query, {"_id": 0})
    if not version:
        version = {
            "layout": board.get("layout") or {},
            "widgets": board.get("widgets") or [],
            "header": board.get("header") or VisualBoardHeaderConfig().model_dump(),
            "version": version_num,
        }

    return board, version, board_db_name


async def _load_board_context(device: dict) -> Dict[str, Any]:
    board, version, board_db_name = await _find_board_for_device(device)
    tenant_id = device.get("tenant_id")

    return {
        "device": device,
        "board": board,
        "version": version,
        "tenant_id": tenant_id,
        "board_db_name": board_db_name,
    }


async def lookup_device_by_token(raw_token: str, *, allow_disabled: bool = False) -> dict:
    """Resolve a device document from a raw token without loading board context."""
    normalized = normalize_device_token(raw_token)
    if not validate_device_token_format(normalized):
        raise HTTPException(status_code=401, detail="Invalid device token format")

    token_hash = hash_device_token(normalized)
    device = None
    for db_name in _device_lookup_db_names():
        coll = get_database(db_name)[DEVICES_COLLECTION]
        doc = await coll.find_one({"token_hash": token_hash}, {"_id": 0})
        if doc:
            set_request_db(db_name)
            device = doc
            break

    if not device:
        raise HTTPException(status_code=401, detail="Invalid device token")

    if not allow_disabled and device.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="Device disabled")

    return device


async def resolve_device_token(raw_token: str) -> Dict[str, Any]:
    device = await lookup_device_by_token(raw_token)
    ctx = await _load_board_context(device)
    ctx["device"] = device
    return ctx


async def connect_device(raw_token: str) -> Dict[str, Any]:
    ctx = await resolve_device_token(raw_token)
    device = ctx["device"]
    board = ctx["board"]
    now = now_iso()
    board_version = int(board.get("version") or 1)
    was_offline = derive_device_status(device) != "online"
    connect_updates: Dict[str, Any] = {
        "last_seen": now,
        "board_version": board_version,
        "updated_at": now,
    }
    if was_offline:
        connect_updates["online_since"] = now

    await db[DEVICES_COLLECTION].update_one(
        {"id": device["id"]},
        {"$set": connect_updates},
    )

    await _record_event(
        device_id=device["id"],
        event="connected",
        tenant_id=device.get("tenant_id"),
        metadata={"board_id": board["id"], "board_version": board_version},
    )

    return {
        "device_id": device["id"],
        "board_id": board["id"],
        "board_version": board_version,
        "screen_name": device.get("screen_name"),
    }


async def get_device_config(raw_token: str) -> Dict[str, Any]:
    ctx = await resolve_device_token(raw_token)
    board = ctx["board"]
    device = ctx["device"]
    return {
        "device_id": device["id"],
        "board_id": board["id"],
        "board_version": int(board.get("version") or 1),
        "screen_name": device.get("screen_name"),
        "refresh_interval": int(board.get("refresh_interval_seconds") or 30),
    }


async def get_device_layout(raw_token: str) -> Dict[str, Any]:
    ctx = await resolve_device_token(raw_token)
    layout = await get_public_layout_from_context(ctx["board"], ctx["version"])
    return layout.model_dump()


async def get_device_data(raw_token: str, *, period_days: int = 30) -> Dict[str, Any]:
    ctx = await resolve_device_token(raw_token)
    data = await get_public_data_from_context(
        ctx["board"],
        ctx["version"],
        ctx.get("tenant_id"),
        period_days=period_days,
    )
    return data.model_dump()


async def record_device_heartbeat(
    *,
    device_id: str,
    raw_token: str,
) -> Dict[str, Any]:
    ctx = await resolve_device_token(raw_token)
    device = ctx["device"]
    if device["id"] != device_id:
        raise HTTPException(status_code=403, detail="Device ID does not match token")

    board = ctx["board"]
    now = now_iso()
    board_version = int(board.get("version") or 1)

    await db[DEVICES_COLLECTION].update_one(
        {"id": device_id},
        {
            "$set": {
                "last_seen": now,
                "board_version": board_version,
                "updated_at": now,
            }
        },
    )

    await _record_event(
        device_id=device_id,
        event="heartbeat",
        tenant_id=device.get("tenant_id"),
        metadata={"board_id": board["id"], "board_version": board_version},
    )

    return {
        "device_id": device_id,
        "status": derive_device_status({**device, "last_seen": now}),
        "board_version": board_version,
        "last_seen": now,
    }
