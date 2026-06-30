#!/usr/bin/env python3
"""
Repair Tyromer operations visual boards to the canonical shop-floor TV layout.

Updates visual_boards, visual_board_templates, and the latest visual_board_versions
per board so kiosk displays show correct widgets without manual republish.

Usage:
  MONGO_URL=... python scripts/repair_tyromer_visual_board.py --dry-run
  MONGO_URL=... PRIMARY_TENANT_ID=Tyromer python scripts/repair_tyromer_visual_board.py
  MONGO_URL=... python scripts/repair_tyromer_visual_board.py --tenant-id Tyromer
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db  # noqa: E402
from models.visual_board import (  # noqa: E402
    BoardType,
    default_tyromer_operations_layout,
    default_tyromer_operations_widgets,
)
from services.visual_board_helpers import (  # noqa: E402
    BOARDS_COLLECTION,
    TEMPLATES_COLLECTION,
    VERSIONS_COLLECTION,
    now_iso,
)

TYROMER_TEMPLATE_NAME = "Tyromer Operations Board"


def _default_tenant_id() -> Optional[str]:
    return os.environ.get("PRIMARY_TENANT_ID") or os.environ.get("BACKFILL_TENANT_ID")


def _canonical_payload() -> Dict[str, Any]:
    widgets = [w.model_dump() for w in default_tyromer_operations_widgets()]
    layout = default_tyromer_operations_layout().model_dump()
    return {"widgets": widgets, "layout": layout, "theme": "light"}


async def _latest_version(board_id: str, tenant_id: str) -> Optional[dict]:
    return await db[VERSIONS_COLLECTION].find_one(
        {"board_id": board_id, "tenant_id": tenant_id},
        {"_id": 0},
        sort=[("version", -1)],
    )


async def repair_tyromer_visual_board(
    tenant_id: str,
    *,
    dry_run: bool = False,
) -> Dict[str, Any]:
    canonical = _canonical_payload()
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

        version = await _latest_version(board_id, tenant_id)
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


def _print_summary(summary: Dict[str, Any]) -> None:
    mode = "DRY RUN" if summary["dry_run"] else "APPLIED"
    print(f"\n[{mode}] Tyromer visual board repair for tenant_id={summary['tenant_id']!r}")
    print(f"  Operations boards: {len(summary['boards_updated'])}")
    for b in summary["boards_updated"]:
        print(f"    - {b['name']} ({b['id']})")
    print(f"  Templates: {len(summary['templates_updated'])}")
    for t in summary["templates_updated"]:
        print(f"    - {t['name']} ({t['id']})")
    print(f"  Latest versions: {len(summary['versions_updated'])}")
    for v in summary["versions_updated"]:
        print(f"    - board {v['board_id']} v{v['version']} ({v['id']})")
    if not summary["boards_updated"] and not summary["templates_updated"]:
        print("  (no matching documents found)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair Tyromer operations visual board layout")
    parser.add_argument(
        "--tenant-id",
        default=_default_tenant_id(),
        help="Tenant id (default: PRIMARY_TENANT_ID or BACKFILL_TENANT_ID env)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be updated without writing to MongoDB",
    )
    args = parser.parse_args()

    if not args.tenant_id:
        print(
            "Error: set PRIMARY_TENANT_ID or BACKFILL_TENANT_ID, or pass --tenant-id",
            file=sys.stderr,
        )
        sys.exit(1)

    summary = asyncio.run(repair_tyromer_visual_board(args.tenant_id, dry_run=args.dry_run))
    _print_summary(summary)


if __name__ == "__main__":
    main()
