"""
Visual Management Board service — CRUD, publish lifecycle, versions.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from models.visual_board import (
    BoardStatus,
    BoardType,
    CreateBoardRequest,
    CreateTokenRequest,
    CreateTokenResponse,
    PublishBoardRequest,
    PublishBoardResponse,
    RollbackVersionRequest,
    RotateTokenRequest,
    TokenSummary,
    UpdateBoardRequest,
    VisualBoardLayout,
    VisualBoardResponse,
    VisualBoardWidget,
)
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.visual_board_defaults import default_layout, default_theme, default_widgets
from services.visual_board_helpers import (
    BOARDS_COLLECTION,
    SCREENS_COLLECTION,
    TOKENS_COLLECTION,
    VERSIONS_COLLECTION,
    new_id,
    now_iso,
)
from services.visual_board_qr import generate_qr_data_url
from services.visual_board_token import generate_token, hash_token

logger = logging.getLogger(__name__)


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


async def _board_has_active_token(board_id: str, user: dict) -> bool:
    count = await db[TOKENS_COLLECTION].count_documents(
        merge_tenant_filter({"board_id": board_id, "is_active": True}, user)
    )
    return count > 0


async def create_board(request: CreateBoardRequest, user: dict) -> VisualBoardResponse:
    now = now_iso()
    board_id = new_id("board")
    widgets = default_widgets(request.board_type)
    doc = with_tenant_id(
        {
            "id": board_id,
            "name": request.name,
            "description": request.description or "",
            "status": BoardStatus.DRAFT.value,
            "board_type": request.board_type.value,
            "version": 0,
            "widgets": [w.model_dump() for w in widgets],
            "layout": default_layout(request.board_type).model_dump(),
            "theme": default_theme(request.board_type, request.theme),
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

    updates: Dict[str, Any] = {"updated_at": now_iso()}
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
    now = now_iso()
    raw_token, token_hash = generate_token()
    token_id = new_id("vbt")
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

    now = now_iso()
    new_version = int(doc.get("version") or 0) + 1
    version_id = new_id("vbv")
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

    now = now_iso()
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

    now = now_iso()
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

    now = now_iso()
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


from services.visual_board_screens_service import (  # noqa: E402
    create_screen,
    delete_screen,
    get_analytics,
    list_all_screens,
    list_screens,
    record_analytics_event,
    record_board_view,
    record_heartbeat,
    update_screen,
)
from services.visual_board_templates_service import (  # noqa: E402
    create_board_from_template,
    create_template,
    delete_template,
    list_templates,
    update_template,
)

__all__ = [
    "create_board",
    "create_board_from_template",
    "create_board_token",
    "create_screen",
    "create_template",
    "delete_board",
    "delete_screen",
    "delete_template",
    "get_analytics",
    "get_board",
    "list_all_screens",
    "list_board_tokens",
    "list_boards",
    "list_screens",
    "list_templates",
    "list_versions",
    "publish_board",
    "record_analytics_event",
    "record_board_view",
    "record_heartbeat",
    "resolve_token",
    "revoke_board_token",
    "rollback_board_version",
    "rotate_token",
    "tenant_display_user",
    "unpublish_board",
    "update_board",
    "update_screen",
    "update_template",
]
