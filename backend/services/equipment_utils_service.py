"""Equipment hierarchy search and static reference data."""
from database import db
from iso14224_models import (
    ISO_LEVEL_ORDER,
    CRITICALITY_PROFILES,
    Discipline,
    get_valid_parent_level,
    get_valid_child_levels,
    ISO_LEVEL_LABELS,
)
from services.tenant_schema import merge_tenant_filter
from utils.mongo_regex import case_insensitive_contains


def get_disciplines() -> dict:
    return {"disciplines": [d.value for d in Discipline]}


def get_criticality_profiles() -> dict:
    return {"profiles": CRITICALITY_PROFILES}


def get_iso_levels() -> dict:
    return {
        "levels": [level.value for level in ISO_LEVEL_ORDER],
        "labels": {level.value: ISO_LEVEL_LABELS.get(level, level.value) for level in ISO_LEVEL_ORDER},
        "hierarchy": {
            level.value: {
                "label": ISO_LEVEL_LABELS.get(level, level.value),
                "parent": get_valid_parent_level(level).value if get_valid_parent_level(level) else None,
                "children": [c.value for c in get_valid_child_levels(level)],
            }
            for level in ISO_LEVEL_ORDER
        },
    }


async def search_equipment(user: dict, q: str, limit: int = 10) -> dict:
    if not q or len(q) < 2:
        return {"results": []}

    user_role = user.get("role", "viewer")
    assigned = user.get("assigned_installations", [])
    is_admin_or_owner = user_role in ["owner", "admin"]

    name_match = case_insensitive_contains(q)
    if not name_match:
        return {"results": []}

    fetch_limit = limit if is_admin_or_owner else limit * 3
    nodes = await db.equipment_nodes.find(
        merge_tenant_filter({"name": name_match}, user),
        {"_id": 0, "id": 1, "name": 1, "level": 1, "parent_id": 1, "full_path": 1, "installation_id": 1},
    ).limit(fetch_limit).to_list(fetch_limit)

    if not is_admin_or_owner and assigned:
        installations = await db.equipment_nodes.find(
            merge_tenant_filter({"level": "installation", "name": {"$in": assigned}}, user),
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(100)
        installation_ids = {i["id"] for i in installations}

        filtered_nodes = []
        for node in nodes:
            if node.get("level") == "installation" and node.get("id") in installation_ids:
                filtered_nodes.append(node)
                continue

            if node.get("installation_id") in installation_ids:
                filtered_nodes.append(node)
                continue

            current = node
            depth = 0
            belongs_to_assigned = False
            while current.get("parent_id") and depth < 15:
                parent = await db.equipment_nodes.find_one(
                    merge_tenant_filter({"id": current["parent_id"]}, user),
                    {"_id": 0, "id": 1, "name": 1, "parent_id": 1, "level": 1},
                )
                if parent:
                    if parent.get("level") == "installation" and parent.get("id") in installation_ids:
                        belongs_to_assigned = True
                        break
                    current = parent
                else:
                    break
                depth += 1

            if belongs_to_assigned:
                filtered_nodes.append(node)

        nodes = filtered_nodes[:limit]
    else:
        nodes = nodes[:limit]

    for node in nodes:
        if not node.get("full_path") and not node.get("path"):
            path_parts = [node["name"]]
            current = node
            depth = 0
            while current.get("parent_id") and depth < 10:
                parent = await db.equipment_nodes.find_one(
                    merge_tenant_filter({"id": current["parent_id"]}, user),
                    {"_id": 0, "name": 1, "parent_id": 1},
                )
                if parent:
                    path_parts.insert(0, parent["name"])
                    current = parent
                else:
                    break
                depth += 1
            node["path"] = " > ".join(path_parts)
        elif node.get("full_path"):
            node["path"] = node["full_path"]

    return {"results": nodes}
