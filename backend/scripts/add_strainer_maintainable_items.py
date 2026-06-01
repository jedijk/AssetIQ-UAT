#!/usr/bin/env python3
"""
Add maintainable items from an Excel file under a Strainer parent (tag 1F-3001).

Uses the Equipment Manager API when API_URL + credentials are set, or MongoDB when MONGO_URL is set.

Example:
  export API_URL=https://your-uat-host
  export IMPORT_EMAIL=owner@example.com
  export IMPORT_PASSWORD=...
  python backend/scripts/add_strainer_maintainable_items.py \\
    --excel "/Users/jaapvandijk/Desktop/new add.xls" \\
    --parent-tag 1F-3001 \\
    --installation-name Tyromer
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

STRAINER_EQUIPMENT_UNIT_ID = "0c854eb4-4e66-4916-aa88-aa0e85642896"
TYROMER_INSTALLATION_ID = "5fb4f269-191f-47d1-b190-e865a6430c7e"

LEVEL_MAP = {
    "maintainable item": "maintainable_item",
    "maintainable_item": "maintainable_item",
    "subunit": "subunit",
}


def read_rows(excel_path: Path) -> list[dict]:
    df = pd.read_excel(excel_path)
    df.columns = [str(c).strip() for c in df.columns]
    tag_col = next((c for c in df.columns if c.lower().startswith("tag") or c.upper() == "ID"), None)
    name_col = next((c for c in df.columns if c.lower() == "name"), None)
    level_col = next((c for c in df.columns if c.lower() == "level"), None)
    if not tag_col or not name_col or not level_col:
        raise ValueError(f"Expected Tag, Name, Level columns; got {list(df.columns)}")
    rows = []
    for _, row in df.iterrows():
        tag = str(row[tag_col]).strip() if pd.notna(row[tag_col]) else ""
        name = str(row[name_col]).strip() if pd.notna(row[name_col]) else ""
        level_raw = str(row[level_col]).strip() if pd.notna(row[level_col]) else ""
        level = LEVEL_MAP.get(level_raw.lower().replace("_", " "), LEVEL_MAP.get(level_raw.lower()))
        if not tag or not name or not level:
            continue
        rows.append({"tag": tag, "name": name, "level": level})
    return rows


async def import_via_api(args: argparse.Namespace, rows: list[dict]) -> int:
    import httpx

    api_url = args.api_url or os.environ.get("API_URL", "").rstrip("/")
    email = args.email or os.environ.get("IMPORT_EMAIL") or os.environ.get("AUTH_EMAIL")
    password = args.password or os.environ.get("IMPORT_PASSWORD") or os.environ.get("AUTH_PASSWORD")
    if not api_url or not email or not password:
        raise SystemExit("Set API_URL, IMPORT_EMAIL, and IMPORT_PASSWORD for API import.")

    async with httpx.AsyncClient(timeout=60.0) as client:
        login = await client.post(f"{api_url}/api/auth/login", json={"email": email, "password": password})
        login.raise_for_status()
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        nodes_resp = await client.get(f"{api_url}/api/equipment-hierarchy/nodes", headers=headers)
        nodes_resp.raise_for_status()
        payload = nodes_resp.json()
        nodes = payload.get("nodes", payload) if isinstance(payload, dict) else payload

        parent = _find_parent(nodes, args.parent_tag, args.parent_name)
        parent = await _ensure_subunit_parent(client, headers, nodes, parent, args)

        by_tag = {n.get("tag"): n for n in nodes if isinstance(n, dict) and n.get("tag")}
        created = 0
        for row in rows:
            if row["level"] != "maintainable_item":
                print(f"Skip {row['tag']}: level {row['level']} (only maintainable items supported)")
                continue
            if row["tag"] in by_tag:
                print(f"Exists {row['tag']}: {row['name']}")
                continue
            body = {
                "name": row["name"],
                "level": "maintainable_item",
                "parent_id": parent["id"],
                "tag": row["tag"],
            }
            resp = await client.post(f"{api_url}/api/equipment-hierarchy/nodes", headers=headers, json=body)
            if resp.status_code not in (200, 201):
                print(f"Failed {row['tag']}: {resp.text}")
                continue
            created += 1
            print(f"Created {row['tag']}: {row['name']} under {parent.get('name')} ({parent.get('tag')})")
        return created


def _find_parent(nodes: list, parent_tag: str, parent_name: str | None) -> dict | None:
    parent_tag_u = parent_tag.upper()
    for n in nodes:
        if not isinstance(n, dict):
            continue
        tag = (n.get("tag") or "").upper()
        name = (n.get("name") or "").lower()
        if tag == parent_tag_u:
            return n
        if parent_name and name == parent_name.lower():
            return n
        if parent_tag_u in name and "strainer" in name:
            return n
    for n in nodes:
        if isinstance(n, dict) and (n.get("name") or "").strip().lower() == "strainer":
            return n
    return None


async def _ensure_subunit_parent(client, headers, nodes: list, parent: dict | None, args) -> dict:
    """Maintainable items must sit under a subunit; create one tagged 1F-3001 under Strainer if needed."""
    import httpx

    api_url = args.api_url or os.environ.get("API_URL", "").rstrip("/")

    if parent and parent.get("level") == "subunit":
        return parent

    strainer = parent
    if not strainer or strainer.get("level") != "equipment_unit":
        strainer = next(
            (n for n in nodes if isinstance(n, dict) and (n.get("name") or "").strip().lower() == "strainer"),
            None,
        )
    if not strainer:
        raise SystemExit(f"Could not find Strainer equipment unit or parent tag {args.parent_tag}")

    # Subunit under Strainer with tag 1F-3001
    for n in nodes:
        if isinstance(n, dict) and (n.get("tag") or "").upper() == args.parent_tag.upper():
            if n.get("level") == "subunit":
                return n

    body = {
        "name": args.parent_name or f"Strainer {args.parent_tag}",
        "level": "subunit",
        "parent_id": strainer["id"],
        "tag": args.parent_tag,
    }
    resp = await client.post(f"{api_url}/api/equipment-hierarchy/nodes", headers=headers, json=body)
    if resp.status_code not in (200, 201):
        raise SystemExit(f"Failed to create subunit parent: {resp.text}")
    subunit = resp.json()
    print(f"Created subunit {subunit.get('tag')}: {subunit.get('name')} under {strainer.get('name')}")
    return subunit


async def import_via_mongo(args: argparse.Namespace, rows: list[dict]) -> int:
    from motor.motor_asyncio import AsyncIOMotorClient

    mongo_url = args.mongo_url or os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq-UAT")
    if not mongo_url:
        raise SystemExit("Set MONGO_URL for direct database import.")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    installation_id = args.installation_id or TYROMER_INSTALLATION_ID
    existing = await db.equipment_nodes.find(
        {"installation_id": installation_id},
        {"_id": 0},
    ).to_list(10000)

    parent = _find_parent(existing, args.parent_tag, args.parent_name)
    now = datetime.now(timezone.utc).isoformat()
    created_by = args.created_by or "import-script"

    strainer = parent
    if not strainer or strainer.get("level") not in ("subunit", "equipment_unit"):
        strainer = next(
            (n for n in existing if (n.get("name") or "").strip().lower() == "strainer"),
            None,
        )

    if not parent or parent.get("level") == "equipment_unit":
        parent = next(
            (n for n in existing if (n.get("tag") or "").upper() == args.parent_tag.upper() and n.get("level") == "subunit"),
            None,
        )
        if not parent and strainer:
            parent_id = str(uuid.uuid4())
            sort_orders = [n.get("sort_order") or 0 for n in existing if n.get("parent_id") == strainer["id"]]
            parent = {
                "id": parent_id,
                "name": args.parent_name or f"Strainer {args.parent_tag}",
                "tag": args.parent_tag,
                "level": "subunit",
                "parent_id": strainer["id"],
                "installation_id": installation_id,
                "equipment_type_id": None,
                "description": "",
                "criticality": None,
                "discipline": None,
                "sort_order": (max(sort_orders) if sort_orders else 0) + 1,
                "created_by": created_by,
                "created_at": now,
                "updated_at": now,
            }
            await db.equipment_nodes.insert_one(parent)
            existing.append(parent)
            print(f"Created subunit {parent['tag']} under {strainer.get('name')}")

    if not parent:
        raise SystemExit("Could not resolve parent node.")

    by_tag = {n.get("tag"): n for n in existing if n.get("tag")}
    created = 0
    for row in rows:
        if row["level"] != "maintainable_item":
            continue
        if row["tag"] in by_tag:
            print(f"Exists {row['tag']}")
            continue
        sort_orders = [n.get("sort_order") or 0 for n in existing if n.get("parent_id") == parent["id"]]
        node = {
            "id": str(uuid.uuid4()),
            "name": row["name"],
            "tag": row["tag"],
            "level": "maintainable_item",
            "parent_id": parent["id"],
            "installation_id": installation_id,
            "equipment_type_id": None,
            "description": "",
            "criticality": None,
            "discipline": None,
            "sort_order": (max(sort_orders) if sort_orders else 0) + 1,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        await db.equipment_nodes.insert_one(node)
        existing.append(node)
        by_tag[row["tag"]] = node
        created += 1
        print(f"Created {row['tag']}: {row['name']}")
    client.close()
    return created


def update_seed_data(rows: list[dict], parent_tag: str, parent_name: str) -> None:
    import json

    seed_path = ROOT / "seed_data.json"
    with open(seed_path) as f:
        data = json.load(f)
    nodes = data["equipment_nodes"]
    by_tag = {n.get("tag"): n for n in nodes if n.get("tag")}
    now = datetime.now(timezone.utc).isoformat()
    created_by = "e46338cd-915a-4830-99c3-eeefb677a70f"

    parent = _find_parent(nodes, parent_tag, parent_name)
    if not parent or parent.get("level") == "equipment_unit":
        strainer_id = STRAINER_EQUIPMENT_UNIT_ID
        parent = by_tag.get(parent_tag)
        if not parent:
            sorts = [n.get("sort_order") or 0 for n in nodes if n.get("parent_id") == strainer_id]
            parent = {
                "id": str(uuid.uuid4()),
                "name": parent_name,
                "tag": parent_tag,
                "level": "subunit",
                "parent_id": strainer_id,
                "equipment_type_id": None,
                "description": "",
                "criticality": None,
                "discipline": None,
                "sort_order": (max(sorts) if sorts else 0) + 1,
                "created_by": created_by,
                "created_at": now,
                "updated_at": now,
            }
            nodes.append(parent)
            by_tag[parent_tag] = parent

    added = 0
    for row in rows:
        if row["tag"] in by_tag:
            continue
        sorts = [n.get("sort_order") or 0 for n in nodes if n.get("parent_id") == parent["id"]]
        nodes.append({
            "id": str(uuid.uuid4()),
            "name": row["name"],
            "tag": row["tag"],
            "level": "maintainable_item",
            "parent_id": parent["id"],
            "equipment_type_id": None,
            "description": "",
            "criticality": None,
            "discipline": None,
            "sort_order": (max(sorts) if sorts else 0) + 1,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        })
        added += 1

    with open(seed_path, "w") as f:
        json.dump(data, f)
    print(f"Updated seed_data.json: {added} maintainable items under {parent.get('name')} ({parent.get('tag')})")


def write_import_ready_excel(rows: list[dict], out_path: Path, parent_tag: str) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Tag", "Name", "Level", "Parent"])
    for row in rows:
        ws.append([row["tag"], row["name"], "Maintainable Item", parent_tag])
    wb.save(out_path)
    print(f"Wrote import-ready Excel: {out_path}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Add Strainer 1F-3001 maintainable items from Excel")
    parser.add_argument("--excel", required=True, type=Path)
    parser.add_argument("--parent-tag", default="1F-3001")
    parser.add_argument("--parent-name", default="Strainer 1F-3001")
    parser.add_argument("--installation-id", default=TYROMER_INSTALLATION_ID)
    parser.add_argument("--installation-name", default="Tyromer")
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--email", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--mongo-url", default=os.environ.get("MONGO_URL"))
    parser.add_argument("--seed-only", action="store_true", help="Only update backend/seed_data.json")
    parser.add_argument(
        "--write-excel",
        type=Path,
        default=Path("/Users/jaapvandijk/Desktop/new add - import ready.xlsx"),
    )
    args = parser.parse_args()

    rows = read_rows(args.excel)
    print(f"Read {len(rows)} rows from {args.excel}")

    if args.write_excel:
        write_import_ready_excel(rows, args.write_excel, args.parent_tag)

    if args.seed_only:
        update_seed_data(rows, args.parent_tag, args.parent_name)
        return

    if args.mongo_url or os.environ.get("MONGO_URL"):
        n = await import_via_mongo(args, rows)
        print(f"Mongo import done: {n} created")
        return

    if args.api_url or (os.environ.get("API_URL") and os.environ.get("IMPORT_EMAIL")):
        n = await import_via_api(args, rows)
        print(f"API import done: {n} created")
        return

    update_seed_data(rows, args.parent_tag, args.parent_name)
    print(
        "\nNo API_URL/MONGO_URL configured — updated seed_data.json only.\n"
        "To import into UAT: set MONGO_URL or API_URL + IMPORT_EMAIL + IMPORT_PASSWORD and re-run,\n"
        "or use Equipment Manager → Import Excel with the generated 'import ready' file."
    )


if __name__ == "__main__":
    asyncio.run(main())
