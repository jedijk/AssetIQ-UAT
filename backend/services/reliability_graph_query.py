"""
Read-side reliability graph — context assembly for RIL dashboards and AI copilots.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from database import db
from services.reliability_graph import COLLECTION, get_edges_for_equipment


async def get_equipment_reliability_context(
    equipment_id: str,
    *,
    edge_limit: int = 100,
) -> Dict[str, Any]:
    """Bundle graph edges plus lightweight equipment metadata for AI/RIL."""
    edges = await get_edges_for_equipment(equipment_id, limit=edge_limit)
    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "equipment_type_id": 1, "criticality": 1},
    )
    program = await db.maintenance_programs_v2.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0, "id": 1, "source_strategy_version": 1, "tasks": 1},
    )
    task_count = len((program or {}).get("tasks") or [])
    return {
        "equipment_id": equipment_id,
        "equipment": equipment,
        "program_task_count": task_count,
        "strategy_version": (program or {}).get("source_strategy_version"),
        "edges": edges,
        "edge_count": len(edges),
    }


async def count_edges_by_relation() -> Dict[str, int]:
    """Aggregate edge counts by relation type (intelligence map KPIs)."""
    pipeline = [
        {"$group": {"_id": "$relation", "count": {"$sum": 1}}},
    ]
    cursor = db[COLLECTION].aggregate(pipeline)
    rows = await cursor.to_list(50)
    return {row["_id"]: row["count"] for row in rows if row.get("_id")}


async def sync_observation_edge(
    *,
    observation_id: str,
    equipment_id: Optional[str],
    failure_mode_id: Optional[str] = None,
    threat_id: Optional[str] = None,
) -> None:
    """Materialize observation → equipment / failure_mode links in the graph."""
    from services.reliability_graph import upsert_edge

    if equipment_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="observed_on",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
        )
    if failure_mode_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="indicates_failure_mode",
            target_type="failure_mode",
            target_id=failure_mode_id,
            equipment_id=equipment_id,
        )
    if threat_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="linked_to_threat",
            target_type="threat",
            target_id=threat_id,
            equipment_id=equipment_id,
        )
