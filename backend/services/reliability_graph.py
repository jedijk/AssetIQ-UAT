"""
Reliability knowledge graph — lightweight edge store in MongoDB.

Edges link equipment, strategies, failure modes, program tasks, and scheduled work
for traversal and future AI/RIL context assembly.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db

logger = logging.getLogger(__name__)

COLLECTION = "reliability_edges"


async def upsert_edge(
    *,
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    edge_id = f"{source_type}:{source_id}:{relation}:{target_type}:{target_id}"
    doc = {
        "id": edge_id,
        "source_type": source_type,
        "source_id": source_id,
        "relation": relation,
        "target_type": target_type,
        "target_id": target_id,
        "equipment_type_id": equipment_type_id,
        "equipment_id": equipment_id,
        "metadata": metadata or {},
        "updated_at": now,
    }
    await db[COLLECTION].update_one(
        {"id": edge_id},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def sync_edges_for_apply_strategy(
    *,
    equipment_type_id: str,
    equipment_ids: List[str],
    strategy_version: str,
) -> Dict[str, int]:
    """
    Materialize graph edges after Apply Strategy:
    equipment_type → strategy, equipment → program, task → failure_mode.
    """
    created = 0
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0},
    )
    if not strategy:
        return {"edges_upserted": 0}

    for equipment_id in equipment_ids:
        await upsert_edge(
            source_type="equipment",
            source_id=equipment_id,
            relation="has_strategy_type",
            target_type="equipment_type_strategy",
            target_id=equipment_type_id,
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            metadata={"strategy_version": strategy_version},
        )
        created += 1

        program = await db.maintenance_programs_v2.find_one(
            {"equipment_id": equipment_id},
            {"_id": 0},
        )
        if not program:
            continue

        program_id = program.get("id") or equipment_id
        await upsert_edge(
            source_type="equipment",
            source_id=equipment_id,
            relation="has_program",
            target_type="maintenance_program_v2",
            target_id=program_id,
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            metadata={"source_strategy_version": program.get("source_strategy_version")},
        )
        created += 1

        for task in program.get("tasks") or []:
            task_id = task.get("id")
            if not task_id:
                continue
            trace = task.get("traceability") or {}
            template_id = trace.get("task_template_id")
            fm_id = trace.get("failure_mode_id")

            if template_id:
                await upsert_edge(
                    source_type="program_task",
                    source_id=task_id,
                    relation="derived_from_template",
                    target_type="strategy_task_template",
                    target_id=template_id,
                    equipment_type_id=equipment_type_id,
                    equipment_id=equipment_id,
                )
                created += 1

            if fm_id:
                await upsert_edge(
                    source_type="program_task",
                    source_id=task_id,
                    relation="mitigates_failure_mode",
                    target_type="failure_mode",
                    target_id=fm_id,
                    equipment_type_id=equipment_type_id,
                    equipment_id=equipment_id,
                )
                created += 1

    return {"edges_upserted": created}


async def get_edges_for_equipment(
    equipment_id: str,
    *,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    return await db[COLLECTION].find(
        {"equipment_id": equipment_id},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(limit)
