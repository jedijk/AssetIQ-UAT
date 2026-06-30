"""Repair Tyromer operations visual boards to the canonical shop-floor TV layout."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from models.visual_board import (
    BoardType,
    default_tyromer_operations_layout,
    default_tyromer_operations_widgets,
)
from services.visual_board_helpers import (
    BOARDS_COLLECTION,
    TEMPLATES_COLLECTION,
    VERSIONS_COLLECTION,
    now_iso,
)

TYROMER_TEMPLATE_NAME = "Tyromer Operations Board"
_CANONICAL_JSON = Path(__file__).resolve().parents[1] / "scripts/data/tyromer_operations_canonical.json"


def canonical_tyromer_operations_payload() -> Dict[str, Any]:
    """Widgets + layout + theme for the Tyromer operations board."""
    widgets = [w.model_dump() for w in default_tyromer_operations_widgets()]
    layout = default_tyromer_operations_layout().model_dump()
    return {"widgets": widgets, "layout": layout, "theme": "light"}


def load_canonical_tyromer_operations_payload() -> Dict[str, Any]:
    """Load canonical payload from committed JSON (for standalone scripts)."""
    if _CANONICAL_JSON.is_file():
        return json.loads(_CANONICAL_JSON.read_text(encoding="utf-8"))
    return canonical_tyromer_operations_payload()


async def _latest_version(
    db: AsyncIOMotorDatabase, board_id: str, tenant_id: str,
) -> Optional[dict]:
    return await db[VERSIONS_COLLECTION].find_one(
        {"board_id": board_id, "tenant_id": tenant_id},
        {"_id": 0},
        sort=[("version", -1)],
    )


async def repair_tyromer_visual_board(
    db: AsyncIOMotorDatabase,
    tenant_id: str,
    *,
    dry_run: bool = False,
    canonical: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    canonical = canonical or canonical_tyromer_operations_payload()
    now = now_iso()
    summary: Dict[str, Any] = {
        "tenant_id": tenant_id,
        "dry_run": dry_run,
        "boards_updated": [],
        "templates_updated": [],
        "versions_updated": [],
    }

    board_query = {"tenant_id": tenant_id, "board_type": BoardType.OPERATIONS.value}
    boards: List[dict] = await db[BOARDS_COLLECTION].find(board_query, {"_id": 0}).to_list(100)

    for board in boards:
        board_id = board["id"]
        board_name = board.get("name", board_id)
        summary["boards_updated"].append({"id": board_id, "name": board_name})
        if not dry_run:
            await db[BOARDS_COLLECTION].update_one(
                {"id": board_id, "tenant_id": tenant_id},
                {
                    "$set": {
                        "widgets": canonical["widgets"],
                        "layout": canonical["layout"],
                        "theme": canonical["theme"],
                        "updated_at": now,
                    }
                },
            )

        version = await _latest_version(db, board_id, tenant_id)
        if version:
            summary["versions_updated"].append(
                {
                    "id": version["id"],
                    "board_id": board_id,
                    "version": version.get("version"),
                }
            )
            if not dry_run:
                await db[VERSIONS_COLLECTION].update_one(
                    {"id": version["id"], "tenant_id": tenant_id},
                    {
                        "$set": {
                            "widgets": canonical["widgets"],
                            "layout": canonical["layout"],
                        }
                    },
                )

    template_query = {
        "tenant_id": tenant_id,
        "name": TYROMER_TEMPLATE_NAME,
        "board_type": BoardType.OPERATIONS.value,
    }
    templates: List[dict] = await db[TEMPLATES_COLLECTION].find(template_query, {"_id": 0}).to_list(10)
    for tpl in templates:
        summary["templates_updated"].append({"id": tpl["id"], "name": tpl.get("name")})
        if not dry_run:
            await db[TEMPLATES_COLLECTION].update_one(
                {"id": tpl["id"], "tenant_id": tenant_id},
                {
                    "$set": {
                        "widgets": canonical["widgets"],
                        "layout": canonical["layout"],
                        "theme": canonical["theme"],
                        "updated_at": now,
                    }
                },
            )

    return summary
