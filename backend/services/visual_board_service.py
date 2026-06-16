"""
Visual Management Board service — CRUD, publish lifecycle, versions, screens stub.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from models.visual_board import (
    BoardStatus,
    BoardType,
    CreateBoardRequest,
    CreateScreenRequest,
    PublishBoardRequest,
    PublishBoardResponse,
    RotateTokenRequest,
    UpdateBoardRequest,
    VisualBoardLayout,
    VisualBoardResponse,
    VisualBoardWidget,
    default_reliability_widgets,
)
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.visual_board_token import generate_token, hash_token

logger = logging.getLogger(__name__)

BOARDS_COLLECTION = "visual_boards"
VERSIONS_COLLECTION = "visual_board_versions"
TOKENS_COLLECTION = "visual_board_tokens"
SCREENS_COLLECTION = "visual_board_screens"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"


def _serialize_board(doc: dict, *, has_active_token: bool = False) -> VisualBoardResponse:
    widgets_raw = doc.get("widgets") or []
    widgets = [VisualBoardWidget(**w) if isinstance(w, dict) else w for w in widgets_raw]
    layout_raw = doc.get("layout") or {}
    layout = VisualBoardLayout(**layout_raw) if isinstance(layout_raw, dict) else layout_raw
    return VisualBoardResponse(
        id=doc["id"],
        name=doc.get("name", ""),
        description=doc.get("description"),
        status=BoardStatus(doc.get("status", BoardStatus.DRAFT.value)),
        board_type=BoardType(doc.get("board_type", BoardType.RELIABILITY.value)),
        version=int(doc.get("version") or 0),
        widgets=widgets,
        layout=layout,
        theme=doc.get("theme", "dark"),
        refresh_interval_seconds=int(doc.get("refresh_interval_seconds") or 30),
        plant=doc.get("plant"),
        area=doc.get("area"),
        created_by=doc.get("created_by"),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
        published_at=doc.get("published_at"),
        has_active_token=has_active_token,
    )


def _default_widgets(board_type: BoardType) -> List[VisualBoardWidget]:
    if board_type == BoardType.RELIABILITY:
        return default_reliability_widgets()
    return []


async def _board_has_active_token(board_id: str, user: dict) -> bool:
    count = await db[TOKENS_COLLECTION].count_documents(
        merge_tenant_filter({"board_id": board_id, "is_active": True}, user)
    )
    return count > 0


async def create_board(request: CreateBoardRequest, user: dict) -> VisualBoardResponse:
    now = _now_iso()
    board_id = _new_id("board")
    widgets = _default_widgets(request.board_type)
    doc = with_tenant_id(
        {
            "id": board_id,
            "name": request.name,
            "description": request.description or "",
            "status": BoardStatus.DRAFT.value,
            "board_type": request.board_type.value,
            "version": 0,
            "widgets": [w.model_dump() for w in widgets],
            "layout": VisualBoardLayout().model_dump(),
            "theme": request.theme,
            "refresh_interval_seconds": request.refresh_interval_seconds,
            "plant": request.plant,
            "area": request.area,
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
            "published_at": None,
        },
        user,
    )
    await db[BOARDS_COLLECTION].insert_one(doc)
    return _serialize_board(doc, has_active_token=False)


async def list_boards(
    user: dict,
    *,
    status: Optional[str] = None,
    board_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> Dict[str, Any]:
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if board_type:
        query["board_type"] = board_type
    filt = merge_tenant_filter(query, user)
    cursor = (
        db[BOARDS_COLLECTION]
        .find(filt, {"_id": 0})
        .sort("updated_at", -1)
        .skip(skip)
        .limit(min(limit, 200))
    )
    docs = await cursor.to_list(min(limit, 200))
    total = await db[BOARDS_COLLECTION].count_documents(filt)
    items = []
    for doc in docs:
        has_token = await _board_has_active_token(doc["id"], user)
        items.append(_serialize_board(doc, has_active_token=has_token).model_dump())
    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_board(board_id: str, user: dict) -> VisualBoardResponse:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    has_token = await _board_has_active_token(board_id, user)
    return _serialize_board(doc, has_active_token=has_token)


async def update_board(board_id: str, request: UpdateBoardRequest, user: dict) -> VisualBoardResponse:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    updates: Dict[str, Any] = {"updated_at": _now_iso()}
    data = request.model_dump(exclude_unset=True)
    if "widgets" in data and data["widgets"] is not None:
        updates["widgets"] = [w.model_dump() if hasattr(w, "model_dump") else w for w in data["widgets"]]
    if "layout" in data and data["layout"] is not None:
        layout = data["layout"]
        updates["layout"] = layout.model_dump() if hasattr(layout, "model_dump") else layout
    for key in ("name", "description", "theme", "refresh_interval_seconds", "plant", "area"):
        if key in data and data[key] is not None:
            updates[key] = data[key]
    if "board_type" in data and data["board_type"] is not None:
        bt = data["board_type"]
        updates["board_type"] = bt.value if hasattr(bt, "value") else bt

    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board_id}, user),
        {"$set": updates},
    )
    return await get_board(board_id, user)


async def delete_board(board_id: str, user: dict) -> Dict[str, bool]:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    await db[BOARDS_COLLECTION].delete_one(merge_tenant_filter({"id": board_id}, user))
    await db[VERSIONS_COLLECTION].delete_many(merge_tenant_filter({"board_id": board_id}, user))
    await db[TOKENS_COLLECTION].delete_many(merge_tenant_filter({"board_id": board_id}, user))
    await db[SCREENS_COLLECTION].delete_many(merge_tenant_filter({"board_id": board_id}, user))
    return {"deleted": True}


async def publish_board(
    board_id: str,
    user: dict,
    request: Optional[PublishBoardRequest] = None,
) -> PublishBoardResponse:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    now = _now_iso()
    new_version = int(doc.get("version") or 0) + 1
    version_id = _new_id("vbv")
    version_doc = with_tenant_id(
        {
            "id": version_id,
            "board_id": board_id,
            "version": new_version,
            "layout": doc.get("layout") or {},
            "widgets": doc.get("widgets") or [],
            "filters": {"plant": doc.get("plant"), "area": doc.get("area")},
            "created_at": now,
            "created_by": user.get("id"),
        },
        user,
    )
    await db[VERSIONS_COLLECTION].insert_one(version_doc)

    raw_token, token_hash = generate_token()
    token_id = _new_id("vbt")
    screen_name = (request.screen_name if request else None) or doc.get("name", "Display")
    token_doc = with_tenant_id(
        {
            "id": token_id,
            "board_id": board_id,
            "token_hash": token_hash,
            "screen_name": screen_name,
            "is_active": True,
            "version": new_version,
            "created_at": now,
            "last_used_at": None,
        },
        user,
    )
    await db[TOKENS_COLLECTION].update_many(
        merge_tenant_filter({"board_id": board_id, "is_active": True}, user),
        {"$set": {"is_active": False}},
    )
    await db[TOKENS_COLLECTION].insert_one(token_doc)

    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board_id}, user),
        {
            "$set": {
                "status": BoardStatus.PUBLISHED.value,
                "version": new_version,
                "updated_at": now,
                "published_at": now,
            }
        },
    )

    return PublishBoardResponse(
        board_id=board_id,
        version=new_version,
        token=raw_token,
        url=f"/vmb/{raw_token}",
    )


async def unpublish_board(board_id: str, user: dict) -> Dict[str, Any]:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    now = _now_iso()
    await db[TOKENS_COLLECTION].update_many(
        merge_tenant_filter({"board_id": board_id}, user),
        {"$set": {"is_active": False}},
    )
    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board_id}, user),
        {"$set": {"status": BoardStatus.ARCHIVED.value, "updated_at": now}},
    )
    return {"board_id": board_id, "status": BoardStatus.ARCHIVED.value}


async def rotate_token(
    board_id: str,
    user: dict,
    request: Optional[RotateTokenRequest] = None,
) -> PublishBoardResponse:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    if doc.get("status") != BoardStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Board must be published to rotate token")

    version = int(doc.get("version") or 1)
    now = _now_iso()
    raw_token, token_hash = generate_token()
    token_id = _new_id("vbt")
    screen_name = (request.screen_name if request else None) or doc.get("name", "Display")

    await db[TOKENS_COLLECTION].update_many(
        merge_tenant_filter({"board_id": board_id, "is_active": True}, user),
        {"$set": {"is_active": False}},
    )
    token_doc = with_tenant_id(
        {
            "id": token_id,
            "board_id": board_id,
            "token_hash": token_hash,
            "screen_name": screen_name,
            "is_active": True,
            "version": version,
            "created_at": now,
            "last_used_at": None,
        },
        user,
    )
    await db[TOKENS_COLLECTION].insert_one(token_doc)

    return PublishBoardResponse(
        board_id=board_id,
        version=version,
        token=raw_token,
        url=f"/vmb/{raw_token}",
    )


async def list_versions(board_id: str, user: dict) -> Dict[str, Any]:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    cursor = (
        db[VERSIONS_COLLECTION]
        .find(merge_tenant_filter({"board_id": board_id}, user), {"_id": 0})
        .sort("version", -1)
    )
    versions = await cursor.to_list(100)
    return {"board_id": board_id, "items": versions}


async def resolve_token(raw_token: str) -> Dict[str, Any]:
    """
    Resolve a raw board token to board, version snapshot, and tenant context.
    Used by public routes — no JWT.
    """
    token_hash = hash_token(raw_token)
    token_doc = await db[TOKENS_COLLECTION].find_one(
        {"token_hash": token_hash, "is_active": True},
        {"_id": 0},
    )
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid or inactive board token")

    board_id = token_doc["board_id"]
    tenant_id = token_doc.get("tenant_id")
    version_num = int(token_doc.get("version") or 1)

    board_query: Dict[str, Any] = {"id": board_id}
    if tenant_id:
        board_query["tenant_id"] = tenant_id
    board = await db[BOARDS_COLLECTION].find_one(board_query, {"_id": 0})
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    version_query: Dict[str, Any] = {"board_id": board_id, "version": version_num}
    if tenant_id:
        version_query["tenant_id"] = tenant_id
    version = await db[VERSIONS_COLLECTION].find_one(version_query, {"_id": 0})
    if not version:
        version = {
            "layout": board.get("layout") or {},
            "widgets": board.get("widgets") or [],
            "version": version_num,
        }

    now = _now_iso()
    await db[TOKENS_COLLECTION].update_one(
        {"id": token_doc["id"]},
        {"$set": {"last_used_at": now}},
    )

    return {
        "token": token_doc,
        "board": board,
        "version": version,
        "tenant_id": tenant_id,
    }


def tenant_display_user(tenant_id: Optional[str]) -> dict:
    """Synthetic user for tenant-scoped read queries on public displays."""
    user: Dict[str, Any] = {"id": "vmb-display", "role": "viewer"}
    if tenant_id:
        user["company_id"] = tenant_id
    return user


async def record_heartbeat(
    raw_token: str,
    *,
    screen_name: Optional[str] = None,
    device_id: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = await resolve_token(raw_token)
    now = _now_iso()
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
        screen_id = _new_id("vbs")
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

    return {"ok": True, "screen_id": screen_id, "last_seen": now}


async def list_screens(board_id: str, user: dict) -> Dict[str, Any]:
    """Stub: list registered screens for a board."""
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    screens = await db[SCREENS_COLLECTION].find(
        merge_tenant_filter({"board_id": board_id}, user),
        {"_id": 0},
    ).to_list(100)
    return {"board_id": board_id, "items": screens}


async def create_screen(
    board_id: str,
    request: CreateScreenRequest,
    user: dict,
) -> Dict[str, Any]:
    """Stub: register a screen for a board."""
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    now = _now_iso()
    screen_id = _new_id("vbs")
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
    return screen_doc
