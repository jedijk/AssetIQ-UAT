"""Visual management board template CRUD and seeding."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException

from database import db
from models.visual_board import (
    BoardType,
    CreateBoardFromTemplateRequest,
    CreateBoardRequest,
    CreateTemplateRequest,
    TemplateResponse,
    UpdateTemplateRequest,
    VisualBoardLayout,
    VisualBoardWidget,
)
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.visual_board_defaults import default_layout, default_widgets
from services.visual_board_helpers import BOARDS_COLLECTION, TEMPLATES_COLLECTION, new_id, now_iso


def serialize_template(doc: dict) -> TemplateResponse:
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
        await seed_default_templates(user)
        docs = await db[TEMPLATES_COLLECTION].find(filt, {"_id": 0}).sort("updated_at", -1).to_list(100)
    items = [serialize_template(d).model_dump() for d in docs]
    return {"items": items, "total": len(items)}


async def seed_default_templates(user: dict) -> None:
    from models.visual_board import (
        default_executive_widgets,
        default_maintenance_widgets,
        default_reliability_widgets,
        default_tyromer_operations_widgets,
    )

    now = now_iso()
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
                "id": new_id("vbtpl"),
                "name": name,
                "description": f"Default {name.lower()} template",
                "board_type": btype.value,
                "widgets": [w.model_dump() for w in widgets],
                "layout": (
                    default_layout(btype).model_dump()
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
    now = now_iso()
    widgets = request.widgets or default_widgets(request.board_type)
    layout = request.layout or VisualBoardLayout()
    doc = with_tenant_id(
        {
            "id": new_id("vbtpl"),
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
    return serialize_template(doc)


async def update_template(template_id: str, request: UpdateTemplateRequest, user: dict) -> TemplateResponse:
    doc = await db[TEMPLATES_COLLECTION].find_one(
        merge_tenant_filter({"id": template_id}, user),
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    updates: Dict[str, Any] = {"updated_at": now_iso()}
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
    return serialize_template(updated or doc)


async def delete_template(template_id: str, user: dict) -> Dict[str, bool]:
    result = await db[TEMPLATES_COLLECTION].delete_one(
        merge_tenant_filter({"id": template_id}, user),
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"deleted": True}


async def create_board_from_template(request: CreateBoardFromTemplateRequest, user: dict):
    from services import visual_board_service as board_svc

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
    board = await board_svc.create_board(create_req, user)
    widgets = tpl.get("widgets") or []
    layout = tpl.get("layout") or VisualBoardLayout().model_dump()
    await db[BOARDS_COLLECTION].update_one(
        merge_tenant_filter({"id": board.id}, user),
        {"$set": {"widgets": widgets, "layout": layout, "updated_at": now_iso()}},
    )
    return await board_svc.get_board(board.id, user)
