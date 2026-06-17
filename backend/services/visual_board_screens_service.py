"""Visual management board screen registry and analytics."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from database import db
from models.visual_board import CreateScreenRequest, ScreenResponse, UpdateScreenRequest
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.visual_board_helpers import (
    ANALYTICS_COLLECTION,
    BOARDS_COLLECTION,
    SCREENS_COLLECTION,
    SCREEN_OFFLINE_THRESHOLD_SECONDS,
    new_id,
    now_iso,
)

logger = logging.getLogger(__name__)


def derive_screen_status(last_seen: Optional[str]) -> str:
    if not last_seen:
        return "inactive"
    try:
        seen = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
        if seen.tzinfo is None:
            seen = seen.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - seen
        if delta.total_seconds() <= SCREEN_OFFLINE_THRESHOLD_SECONDS:
            return "online"
        return "offline"
    except Exception:
        return "inactive"


def serialize_screen(doc: dict, board_name: Optional[str] = None) -> dict:
    status = doc.get("status") or derive_screen_status(doc.get("last_seen"))
    if doc.get("last_seen"):
        status = derive_screen_status(doc.get("last_seen"))
    return ScreenResponse(
        id=doc["id"],
        board_id=doc.get("board_id", ""),
        token_id=doc.get("token_id"),
        screen_name=doc.get("screen_name", ""),
        location=doc.get("location"),
        device_id=doc.get("device_id"),
        last_seen=doc.get("last_seen"),
        status=status,
        board_name=board_name,
    ).model_dump()


async def record_analytics_event(
    *,
    board_id: str,
    tenant_id: Optional[str],
    event_type: str,
    token_id: Optional[str] = None,
    screen_id: Optional[str] = None,
) -> None:
    doc: Dict[str, Any] = {
        "id": new_id("vba"),
        "board_id": board_id,
        "event_type": event_type,
        "token_id": token_id,
        "screen_id": screen_id,
        "created_at": now_iso(),
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    try:
        await db[ANALYTICS_COLLECTION].insert_one(doc)
    except Exception:
        logger.debug("Analytics event insert failed", exc_info=True)


async def record_heartbeat(
    raw_token: str,
    *,
    screen_name: Optional[str] = None,
    device_id: Optional[str] = None,
) -> Dict[str, Any]:
    from services.visual_board_service import resolve_token

    ctx = await resolve_token(raw_token)
    now = now_iso()
    token_doc = ctx["token"]
    board_id = token_doc["board_id"]
    tenant_id = ctx.get("tenant_id")

    screen_query: Dict[str, Any] = {"token_id": token_doc["id"]}
    if tenant_id:
        screen_query["tenant_id"] = tenant_id
    existing = await db[SCREENS_COLLECTION].find_one(screen_query, {"_id": 0})

    if existing:
        await db[SCREENS_COLLECTION].update_one(
            {"id": existing["id"]},
            {
                "$set": {
                    "last_seen": now,
                    "status": "online",
                    "screen_name": screen_name or existing.get("screen_name"),
                    "device_id": device_id or existing.get("device_id"),
                }
            },
        )
        screen_id = existing["id"]
    else:
        screen_id = new_id("vbs")
        screen_doc: Dict[str, Any] = {
            "id": screen_id,
            "board_id": board_id,
            "token_id": token_doc["id"],
            "screen_name": screen_name or token_doc.get("screen_name", "Display"),
            "location": "",
            "device_id": device_id,
            "last_seen": now,
            "status": "online",
        }
        if tenant_id:
            screen_doc["tenant_id"] = tenant_id
        await db[SCREENS_COLLECTION].insert_one(screen_doc)

    await record_analytics_event(
        board_id=board_id,
        tenant_id=tenant_id,
        event_type="heartbeat",
        token_id=token_doc.get("id"),
        screen_id=screen_id,
    )

    return {"ok": True, "screen_id": screen_id, "last_seen": now}


async def list_screens(board_id: str, user: dict) -> Dict[str, Any]:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1, "name": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    screens = await db[SCREENS_COLLECTION].find(
        merge_tenant_filter({"board_id": board_id}, user),
        {"_id": 0},
    ).to_list(100)
    items = [serialize_screen(s, doc.get("name")) for s in screens]
    return {"board_id": board_id, "items": items}


async def list_all_screens(user: dict) -> Dict[str, Any]:
    screens = await db[SCREENS_COLLECTION].find(
        merge_tenant_filter({}, user),
        {"_id": 0},
    ).sort("last_seen", -1).to_list(500)
    board_ids = list({s.get("board_id") for s in screens if s.get("board_id")})
    board_names: Dict[str, str] = {}
    if board_ids:
        boards = await db[BOARDS_COLLECTION].find(
            merge_tenant_filter({"id": {"$in": board_ids}}, user),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(len(board_ids))
        board_names = {b["id"]: b.get("name", "") for b in boards}
    items = [serialize_screen(s, board_names.get(s.get("board_id", ""))) for s in screens]
    return {"items": items, "total": len(items)}


async def create_screen(
    board_id: str,
    request: CreateScreenRequest,
    user: dict,
) -> Dict[str, Any]:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    now = now_iso()
    screen_id = new_id("vbs")
    screen_doc = with_tenant_id(
        {
            "id": screen_id,
            "board_id": board_id,
            "token_id": request.token_id,
            "screen_name": request.screen_name,
            "location": request.location or "",
            "device_id": request.device_id,
            "last_seen": None,
            "status": "inactive",
            "created_at": now,
        },
        user,
    )
    await db[SCREENS_COLLECTION].insert_one(screen_doc)
    return serialize_screen(screen_doc)


async def update_screen(screen_id: str, request: UpdateScreenRequest, user: dict) -> dict:
    doc = await db[SCREENS_COLLECTION].find_one(
        merge_tenant_filter({"id": screen_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Screen not found")
    updates: Dict[str, Any] = {}
    for key in ("screen_name", "location", "device_id", "token_id"):
        val = getattr(request, key, None)
        if val is not None:
            updates[key] = val
    if updates:
        await db[SCREENS_COLLECTION].update_one(
            merge_tenant_filter({"id": screen_id}, user),
            {"$set": updates},
        )
    updated = await db[SCREENS_COLLECTION].find_one(
        merge_tenant_filter({"id": screen_id}, user),
        {"_id": 0},
    )
    return serialize_screen(updated or doc)


async def delete_screen(screen_id: str, user: dict) -> Dict[str, bool]:
    result = await db[SCREENS_COLLECTION].delete_one(
        merge_tenant_filter({"id": screen_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Screen not found")
    return {"deleted": True}


async def record_board_view(raw_token: str) -> None:
    from services.visual_board_service import resolve_token

    try:
        ctx = await resolve_token(raw_token)
    except HTTPException:
        return
    token_doc = ctx["token"]
    await record_analytics_event(
        board_id=token_doc["board_id"],
        tenant_id=ctx.get("tenant_id"),
        event_type="view",
        token_id=token_doc.get("id"),
    )


async def get_analytics(user: dict, *, days: int = 30) -> Dict[str, Any]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    filt = merge_tenant_filter({"created_at": {"$gte": since}}, user)
    events = await db[ANALYTICS_COLLECTION].find(filt, {"_id": 0}).to_list(10000)
    screens = await db[SCREENS_COLLECTION].find(
        merge_tenant_filter({}, user),
        {"_id": 0},
    ).to_list(500)

    view_count = sum(1 for e in events if e.get("event_type") == "view")
    heartbeat_count = sum(1 for e in events if e.get("event_type") == "heartbeat")
    views_by_board: Dict[str, int] = {}
    for e in events:
        if e.get("event_type") == "view":
            bid = e.get("board_id", "")
            views_by_board[bid] = views_by_board.get(bid, 0) + 1

    online_screens = sum(1 for s in screens if derive_screen_status(s.get("last_seen")) == "online")
    offline_screens = sum(1 for s in screens if derive_screen_status(s.get("last_seen")) == "offline")

    board_ids = list(views_by_board.keys())
    board_names: Dict[str, str] = {}
    if board_ids:
        boards = await db[BOARDS_COLLECTION].find(
            merge_tenant_filter({"id": {"$in": board_ids}}, user),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(len(board_ids))
        board_names = {b["id"]: b.get("name", b["id"]) for b in boards}

    most_viewed = sorted(
        [{"board_id": k, "name": board_names.get(k, k), "views": v} for k, v in views_by_board.items()],
        key=lambda x: x["views"],
        reverse=True,
    )[:10]

    return {
        "period_days": days,
        "total_views": view_count,
        "total_heartbeats": heartbeat_count,
        "active_screens": online_screens,
        "offline_screens": offline_screens,
        "total_screens": len(screens),
        "most_viewed_boards": most_viewed,
        "screens": [serialize_screen(s) for s in screens[:50]],
    }
