"""
Visual Management Board service — CRUD, publish lifecycle, versions, screens stub.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from models.visual_board import (
    BoardStatus,
    BoardType,
    CreateBoardFromTemplateRequest,
    CreateBoardRequest,
    CreateScreenRequest,
    CreateTemplateRequest,
    CreateTokenRequest,
    CreateTokenResponse,
    PublishBoardRequest,
    PublishBoardResponse,
    RollbackVersionRequest,
    RotateTokenRequest,
    ScreenResponse,
    TemplateResponse,
    TokenSummary,
    UpdateBoardRequest,
    UpdateScreenRequest,
    UpdateTemplateRequest,
    VisualBoardLayout,
    VisualBoardResponse,
    VisualBoardWidget,
    default_executive_widgets,
    default_maintenance_widgets,
    default_reliability_widgets,
    default_tyromer_operations_layout,
    default_tyromer_operations_widgets,
)
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.visual_board_qr import generate_qr_data_url
from services.visual_board_token import generate_token, hash_token

logger = logging.getLogger(__name__)

BOARDS_COLLECTION = "visual_boards"
VERSIONS_COLLECTION = "visual_board_versions"
TOKENS_COLLECTION = "visual_board_tokens"
SCREENS_COLLECTION = "visual_board_screens"
TEMPLATES_COLLECTION = "visual_board_templates"
ANALYTICS_COLLECTION = "visual_board_analytics"

SCREEN_OFFLINE_THRESHOLD_SECONDS = 300


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
    if board_type == BoardType.MAINTENANCE:
        return default_maintenance_widgets()
    if board_type == BoardType.EXECUTIVE:
        return default_executive_widgets()
    if board_type == BoardType.OPERATIONS:
        return default_tyromer_operations_widgets()
    return []


def _default_layout(board_type: BoardType) -> VisualBoardLayout:
    if board_type == BoardType.OPERATIONS:
        return default_tyromer_operations_layout()
    return VisualBoardLayout()


def _default_theme(board_type: BoardType, requested: str = "dark") -> str:
    if board_type == BoardType.OPERATIONS and requested == "dark":
        return "light"
    return requested


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
            "layout": _default_layout(request.board_type).model_dump(),
            "theme": _default_theme(request.board_type, request.theme),
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


async def _issue_token(
    board_id: str,
    user: dict,
    *,
    version: int,
    screen_name: str,
    deactivate_token_id: Optional[str] = None,
) -> PublishBoardResponse:
    now = _now_iso()
    raw_token, token_hash = generate_token()
    token_id = _new_id("vbt")
    if deactivate_token_id:
        await db[TOKENS_COLLECTION].update_one(
            merge_tenant_filter({"id": deactivate_token_id, "board_id": board_id}, user),
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
    url = f"/vmb/{raw_token}"
    return PublishBoardResponse(
        board_id=board_id,
        version=version,
        token=raw_token,
        url=url,
        token_id=token_id,
        qr_code_data_url=generate_qr_data_url(url),
    )


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

    screen_name = (request.screen_name if request else None) or doc.get("name", "Display")
    result = await _issue_token(
        board_id, user, version=new_version, screen_name=screen_name
    )

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

    try:
        from services.visual_board_ws_hub import vmb_ws_hub

        token_hashes = await _active_token_hashes(board_id, user)
        await vmb_ws_hub.broadcast_board_tokens(
            token_hashes,
            "board_updated",
            {"board_id": board_id, "version": new_version},
        )
    except Exception:
        logger.debug("WS broadcast skipped on publish", exc_info=True)

    return result.model_copy(update={"version": new_version})


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
    token_id = request.token_id if request else None
    screen_name = (request.screen_name if request else None) or doc.get("name", "Display")
    if token_id:
        existing = await db[TOKENS_COLLECTION].find_one(
            merge_tenant_filter({"id": token_id, "board_id": board_id}, user),
            {"_id": 0},
        )
        if existing:
            screen_name = request.screen_name or existing.get("screen_name") or screen_name
            version = int(existing.get("version") or version)
    return await _issue_token(
        board_id,
        user,
        version=version,
        screen_name=screen_name,
        deactivate_token_id=token_id,
    )


async def create_board_token(
    board_id: str,
    user: dict,
    request: Optional[CreateTokenRequest] = None,
) -> CreateTokenResponse:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    if doc.get("status") != BoardStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Board must be published to create display tokens")

    version = int((request.version if request else None) or doc.get("version") or 1)
    screen_name = (request.screen_name if request else None) or doc.get("name", "Display")
    issued = await _issue_token(board_id, user, version=version, screen_name=screen_name)
    return CreateTokenResponse(
        token_id=issued.token_id or "",
        board_id=board_id,
        version=version,
        token=issued.token,
        url=issued.url,
        screen_name=screen_name,
    )


async def list_board_tokens(board_id: str, user: dict) -> Dict[str, Any]:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")
    tokens = await db[TOKENS_COLLECTION].find(
        merge_tenant_filter({"board_id": board_id}, user),
        {"_id": 0, "token_hash": 0},
    ).sort("created_at", -1).to_list(100)
    items = [TokenSummary(**t).model_dump() for t in tokens]
    return {"board_id": board_id, "items": items}


async def revoke_board_token(board_id: str, token_id: str, user: dict) -> Dict[str, Any]:
    result = await db[TOKENS_COLLECTION].update_one(
        merge_tenant_filter({"id": token_id, "board_id": board_id}, user),
        {"$set": {"is_active": False}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"revoked": True, "token_id": token_id}


async def _active_token_hashes(board_id: str, user: dict) -> list[str]:
    tokens = await db[TOKENS_COLLECTION].find(
        merge_tenant_filter({"board_id": board_id, "is_active": True}, user),
        {"_id": 0, "token_hash": 1},
    ).to_list(50)
    return [t["token_hash"] for t in tokens if t.get("token_hash")]


async def rollback_board_version(
    board_id: str,
    user: dict,
    request: RollbackVersionRequest,
) -> VisualBoardResponse:
    doc = await db[BOARDS_COLLECTION].find_one(
        merge_tenant_filter({"id": board_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Board not found")

    version_doc = await db[VERSIONS_COLLECTION].find_one(
        merge_tenant_filter({"board_id": board_id, "version": request.version}, user),
        {"_id": 0},
    )
    if not version_doc:
        raise HTTPException(status_code=404, detail="Version not found")

    now = _now_iso()
    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board_id}, user),
        {
            "$set": {
                "widgets": version_doc.get("widgets") or [],
                "layout": version_doc.get("layout") or {},
                "version": request.version,
                "updated_at": now,
                "plant": (version_doc.get("filters") or {}).get("plant"),
                "area": (version_doc.get("filters") or {}).get("area"),
            }
        },
    )
    return await get_board(board_id, user)


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

    await record_analytics_event(
        board_id=board_id,
        tenant_id=tenant_id,
        event_type="heartbeat",
        token_id=token_doc.get("id"),
        screen_id=screen_id,
    )

    return {"ok": True, "screen_id": screen_id, "last_seen": now}


def _derive_screen_status(last_seen: Optional[str]) -> str:
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


def _serialize_screen(doc: dict, board_name: Optional[str] = None) -> dict:
    status = doc.get("status") or _derive_screen_status(doc.get("last_seen"))
    if doc.get("last_seen"):
        status = _derive_screen_status(doc.get("last_seen"))
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
    items = [_serialize_screen(s, doc.get("name")) for s in screens]
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
    items = [_serialize_screen(s, board_names.get(s.get("board_id", ""))) for s in screens]
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
    return _serialize_screen(screen_doc)


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
    return _serialize_screen(updated or doc)


async def delete_screen(screen_id: str, user: dict) -> Dict[str, bool]:
    result = await db[SCREENS_COLLECTION].delete_one(
        merge_tenant_filter({"id": screen_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Screen not found")
    return {"deleted": True}


async def record_analytics_event(
    *,
    board_id: str,
    tenant_id: Optional[str],
    event_type: str,
    token_id: Optional[str] = None,
    screen_id: Optional[str] = None,
) -> None:
    doc: Dict[str, Any] = {
        "id": _new_id("vba"),
        "board_id": board_id,
        "event_type": event_type,
        "token_id": token_id,
        "screen_id": screen_id,
        "created_at": _now_iso(),
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    try:
        await db[ANALYTICS_COLLECTION].insert_one(doc)
    except Exception:
        logger.debug("Analytics event insert failed", exc_info=True)


async def record_board_view(raw_token: str) -> None:
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

    online_screens = sum(1 for s in screens if _derive_screen_status(s.get("last_seen")) == "online")
    offline_screens = sum(1 for s in screens if _derive_screen_status(s.get("last_seen")) == "offline")

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
        "screens": [_serialize_screen(s) for s in screens[:50]],
    }


def _serialize_template(doc: dict) -> TemplateResponse:
    widgets_raw = doc.get("widgets") or []
    widgets = [VisualBoardWidget(**w) if isinstance(w, dict) else w for w in widgets_raw]
    layout_raw = doc.get("layout") or {}
    layout = VisualBoardLayout(**layout_raw) if isinstance(layout_raw, dict) else layout_raw
    return TemplateResponse(
        id=doc["id"],
        name=doc.get("name", ""),
        description=doc.get("description"),
        board_type=BoardType(doc.get("board_type", BoardType.RELIABILITY.value)),
        widgets=widgets,
        layout=layout,
        theme=doc.get("theme", "dark"),
        created_by=doc.get("created_by"),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


async def list_templates(user: dict) -> Dict[str, Any]:
    filt = merge_tenant_filter({}, user)
    docs = await db[TEMPLATES_COLLECTION].find(filt, {"_id": 0}).sort("updated_at", -1).to_list(100)
    if not docs:
        await _seed_default_templates(user)
        docs = await db[TEMPLATES_COLLECTION].find(filt, {"_id": 0}).sort("updated_at", -1).to_list(100)
    items = [_serialize_template(d).model_dump() for d in docs]
    return {"items": items, "total": len(items)}


async def _seed_default_templates(user: dict) -> None:
    now = _now_iso()
    defaults = [
        ("Reliability Board", BoardType.RELIABILITY, default_reliability_widgets()),
        ("Maintenance Board", BoardType.MAINTENANCE, default_maintenance_widgets()),
        ("Executive Board", BoardType.EXECUTIVE, default_executive_widgets()),
        (
            "Tyromer Operations Board",
            BoardType.OPERATIONS,
            default_tyromer_operations_widgets(),
        ),
    ]
    for name, btype, widgets in defaults:
        existing = await db[TEMPLATES_COLLECTION].find_one(
            merge_tenant_filter({"name": name, "board_type": btype.value}, user),
        )
        if existing:
            continue
        doc = with_tenant_id(
            {
                "id": _new_id("vbtpl"),
                "name": name,
                "description": f"Default {name.lower()} template",
                "board_type": btype.value,
                "widgets": [w.model_dump() for w in widgets],
                "layout": (
                    default_tyromer_operations_layout().model_dump()
                    if btype == BoardType.OPERATIONS
                    else VisualBoardLayout().model_dump()
                ),
                "theme": "light" if btype == BoardType.OPERATIONS else "dark",
                "created_by": user.get("id"),
                "created_at": now,
                "updated_at": now,
            },
            user,
        )
        await db[TEMPLATES_COLLECTION].insert_one(doc)


async def create_template(request: CreateTemplateRequest, user: dict) -> TemplateResponse:
    now = _now_iso()
    widgets = request.widgets or _default_widgets(request.board_type)
    layout = request.layout or VisualBoardLayout()
    doc = with_tenant_id(
        {
            "id": _new_id("vbtpl"),
            "name": request.name,
            "description": request.description or "",
            "board_type": request.board_type.value,
            "widgets": [w.model_dump() for w in widgets],
            "layout": layout.model_dump() if hasattr(layout, "model_dump") else layout,
            "theme": request.theme,
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
        },
        user,
    )
    await db[TEMPLATES_COLLECTION].insert_one(doc)
    return _serialize_template(doc)


async def update_template(template_id: str, request: UpdateTemplateRequest, user: dict) -> TemplateResponse:
    doc = await db[TEMPLATES_COLLECTION].find_one(
        merge_tenant_filter({"id": template_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    updates: Dict[str, Any] = {"updated_at": _now_iso()}
    data = request.model_dump(exclude_unset=True)
    if "widgets" in data and data["widgets"] is not None:
        updates["widgets"] = [w.model_dump() if hasattr(w, "model_dump") else w for w in data["widgets"]]
    if "layout" in data and data["layout"] is not None:
        layout = data["layout"]
        updates["layout"] = layout.model_dump() if hasattr(layout, "model_dump") else layout
    for key in ("name", "description", "theme"):
        if key in data and data[key] is not None:
            updates[key] = data[key]
    if "board_type" in data and data["board_type"] is not None:
        bt = data["board_type"]
        updates["board_type"] = bt.value if hasattr(bt, "value") else bt
    await db[TEMPLATES_COLLECTION].update_one(
        merge_tenant_filter({"id": template_id}, user),
        {"$set": updates},
    )
    updated = await db[TEMPLATES_COLLECTION].find_one(
        merge_tenant_filter({"id": template_id}, user),
        {"_id": 0},
    )
    return _serialize_template(updated or doc)


async def delete_template(template_id: str, user: dict) -> Dict[str, bool]:
    result = await db[TEMPLATES_COLLECTION].delete_one(
        merge_tenant_filter({"id": template_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"deleted": True}


async def create_board_from_template(request: CreateBoardFromTemplateRequest, user: dict) -> VisualBoardResponse:
    tpl = await db[TEMPLATES_COLLECTION].find_one(
        merge_tenant_filter({"id": request.template_id}, user),
        {"_id": 0},
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    create_req = CreateBoardRequest(
        name=request.name,
        board_type=BoardType(tpl.get("board_type", BoardType.RELIABILITY.value)),
        theme=tpl.get("theme", "dark"),
    )
    board = await create_board(create_req, user)
    widgets = tpl.get("widgets") or []
    layout = tpl.get("layout") or VisualBoardLayout().model_dump()
    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board.id}, user),
        {"$set": {"widgets": widgets, "layout": layout, "updated_at": _now_iso()}},
    )
    return await get_board(board.id, user)
