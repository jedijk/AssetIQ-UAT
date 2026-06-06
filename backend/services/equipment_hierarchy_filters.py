"""
Build MongoDB filters for equipment hierarchy scoping (plant / system / path).
Uses ``full_path`` as the canonical path field with legacy ``parent_path`` fallback.
"""
import re
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


async def _node_path_prefix(db: AsyncIOMotorDatabase, node_id: str) -> Optional[str]:
    node = await db.equipment_nodes.find_one(
        {"id": node_id},
        {"_id": 0, "full_path": 1, "parent_path": 1},
    )
    if not node:
        return None
    return node.get("full_path") or node.get("parent_path")


def _path_descendant_clause(path_prefix: str) -> Dict[str, Any]:
    escaped = re.escape(path_prefix.rstrip("/"))
    return {
        "$or": [
            {"full_path": {"$regex": f"^{escaped}(/|$)"}},
            {"parent_path": {"$regex": f"^{escaped}"}},
        ]
    }


async def apply_plant_system_filters(
    db: AsyncIOMotorDatabase,
    equipment_query: Dict[str, Any],
    plant_id: Optional[str] = None,
    system_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Merge plant/system hierarchy constraints into an equipment_nodes query."""
    and_clauses: List[Dict[str, Any]] = list(equipment_query.get("$and", []))

    if plant_id:
        plant_clause: Dict[str, Any] = {
            "$or": [
                {"installation_id": plant_id},
                {"id": plant_id},
                {"parent_id": plant_id},
            ]
        }
        prefix = await _node_path_prefix(db, plant_id)
        if prefix:
            plant_clause["$or"].append(_path_descendant_clause(prefix))
        and_clauses.append(plant_clause)

    if system_id:
        system_clause: Dict[str, Any] = {
            "$or": [
                {"parent_id": system_id},
                {"id": system_id},
            ]
        }
        prefix = await _node_path_prefix(db, system_id)
        if prefix:
            system_clause["$or"].append(_path_descendant_clause(prefix))
        and_clauses.append(system_clause)

    if and_clauses:
        equipment_query["$and"] = and_clauses
    return equipment_query
