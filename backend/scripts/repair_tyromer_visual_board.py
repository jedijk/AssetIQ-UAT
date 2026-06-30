#!/usr/bin/env python
"""
Repair Tyromer operations visual boards to the canonical shop-floor TV layout.

Uses pymongo only (no motor / database.py) so it runs in the Railway API container.

Usage (UAT/production container — cwd /app):
  python scripts/repair_tyromer_visual_board.py --dry-run
  PRIMARY_TENANT_ID=Tyromer python scripts/repair_tyromer_visual_board.py

Use `python`, not `python3` — system python3 may lack app dependencies.

Alternative (owner auth): POST /api/admin/tenants/{tenant_id}/repair-tyromer-visual-board?dry_run=true
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(_SCRIPTS_DIR)
sys.path.insert(0, _BACKEND_ROOT)

TYROMER_TEMPLATE_NAME = "Tyromer Operations Board"
BOARDS_COLLECTION = "visual_boards"
TEMPLATES_COLLECTION = "visual_board_templates"
VERSIONS_COLLECTION = "visual_board_versions"
BOARD_TYPE_OPERATIONS = "operations"


def _default_tenant_id() -> Optional[str]:
    return os.environ.get("PRIMARY_TENANT_ID") or os.environ.get("BACKFILL_TENANT_ID")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_canonical() -> Dict[str, Any]:
    path = os.path.join(_SCRIPTS_DIR, "data", "tyromer_operations_canonical.json")
    if not os.path.isfile(path):
        print(f"Error: missing {path}", file=sys.stderr)
        sys.exit(1)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _get_db():
    try:
        from pymongo import MongoClient
    except ImportError:
        print(
            "Error: pymongo not found. Use the app Python interpreter:\n"
            "  python scripts/repair_tyromer_visual_board.py --dry-run\n"
            "Not: python3 (system Python may lack dependencies).\n"
            "Or call POST /api/admin/tenants/{tenant_id}/repair-tyromer-visual-board as owner.",
            file=sys.stderr,
        )
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    if not mongo_url:
        print("Error: MONGO_URL environment variable is required", file=sys.stderr)
        sys.exit(1)
    client = MongoClient(mongo_url)
    return client, client[db_name]


def repair_tyromer_visual_board_sync(
    db,
    tenant_id: str,
    *,
    dry_run: bool = False,
) -> Dict[str, Any]:
    canonical = _load_canonical()
    now = _now_iso()
    summary: Dict[str, Any] = {
        "tenant_id": tenant_id,
        "dry_run": dry_run,
        "boards_updated": [],
        "templates_updated": [],
        "versions_updated": [],
    }

    boards = list(
        db[BOARDS_COLLECTION].find(
            {"tenant_id": tenant_id, "board_type": BOARD_TYPE_OPERATIONS},
            {"_id": 0},
        )
    )

    for board in boards:
        board_id = board["id"]
        board_name = board.get("name", board_id)
        summary["boards_updated"].append({"id": board_id, "name": board_name})
        if not dry_run:
            db[BOARDS_COLLECTION].update_one(
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

        version = db[VERSIONS_COLLECTION].find_one(
            {"board_id": board_id, "tenant_id": tenant_id},
            {"_id": 0},
            sort=[("version", -1)],
        )
        if version:
            summary["versions_updated"].append(
                {
                    "id": version["id"],
                    "board_id": board_id,
                    "version": version.get("version"),
                }
            )
            if not dry_run:
                db[VERSIONS_COLLECTION].update_one(
                    {"id": version["id"], "tenant_id": tenant_id},
                    {
                        "$set": {
                            "widgets": canonical["widgets"],
                            "layout": canonical["layout"],
                        }
                    },
                )

    templates = list(
        db[TEMPLATES_COLLECTION].find(
            {
                "tenant_id": tenant_id,
                "name": TYROMER_TEMPLATE_NAME,
                "board_type": BOARD_TYPE_OPERATIONS,
            },
            {"_id": 0},
        )
    )
    for tpl in templates:
        summary["templates_updated"].append({"id": tpl["id"], "name": tpl.get("name")})
        if not dry_run:
            db[TEMPLATES_COLLECTION].update_one(
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

    client, db = _get_db()
    try:
        summary = repair_tyromer_visual_board_sync(
            db, args.tenant_id, dry_run=args.dry_run,
        )
        _print_summary(summary)
    finally:
        client.close()


if __name__ == "__main__":
    main()
