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

from services.program_task_resolution import resolve_program_task_id

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

    programs_cursor = db.maintenance_programs_v2.find(
        {"equipment_id": {"$in": list(equipment_ids)}},
        {"_id": 0},
    )
    programs = await programs_cursor.to_list(len(equipment_ids) or 1)
    program_by_equipment = {
        p["equipment_id"]: p for p in programs if p.get("equipment_id")
    }

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

        program = program_by_equipment.get(equipment_id)
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


async def sync_edge_for_pm_import_task(
    *,
    task_id: str,
    failure_mode_id: str,
    equipment_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    apply_mode: str = "added",
) -> None:
    """Record PM Import → failure mode linkage in the reliability graph."""
    await upsert_edge(
        source_type="pm_import_task",
        source_id=task_id,
        relation="applied_to",
        target_type="failure_mode",
        target_id=failure_mode_id,
        equipment_id=equipment_id,
        equipment_type_id=equipment_type_id,
        metadata={"apply_mode": apply_mode},
    )


async def sync_edges_for_scheduled_task(
    scheduled_task: dict,
    *,
    event: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    """
    Materialize scheduled_task graph edges on lifecycle events.

    Base edges (always):
      scheduled_task → derived_from → program_task
      scheduled_task → scheduled_for → equipment
      scheduled_task → mitigates_failure_mode → failure_mode (when present)

    Lifecycle edges:
      completed → scheduled_task → completed_on → equipment
      cancelled → scheduled_task → cancelled_for → program_task
    """
    task_id = scheduled_task.get("id")
    if not task_id:
        return {"edges_upserted": 0}

    equipment_id = scheduled_task.get("equipment_id")
    program_task_id = await resolve_program_task_id(scheduled_task)
    failure_mode_id = scheduled_task.get("failure_mode_id")
    equipment_type_id = scheduled_task.get("equipment_type_id")
    upserted = 0
    base_meta = {
        "strategy_id": scheduled_task.get("strategy_id"),
        "strategy_version": scheduled_task.get("strategy_version"),
        "task_name": scheduled_task.get("task_name"),
    }

    if program_task_id:
        await upsert_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation="derived_from",
            target_type="program_task",
            target_id=program_task_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            metadata=base_meta,
        )
        upserted += 1

    if equipment_id:
        await upsert_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation="scheduled_for",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            metadata=base_meta,
        )
        upserted += 1

    if failure_mode_id:
        await upsert_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation="mitigates_failure_mode",
            target_type="failure_mode",
            target_id=failure_mode_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            metadata=base_meta,
        )
        upserted += 1

    event_meta = {**base_meta, **(metadata or {}), "event": event}
    if event == "completed" and equipment_id:
        await upsert_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation="completed_on",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            metadata=event_meta,
        )
        upserted += 1
    elif event == "cancelled" and program_task_id:
        await upsert_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation="cancelled_for",
            target_type="program_task",
            target_id=program_task_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            metadata=event_meta,
        )
        upserted += 1

    return {"edges_upserted": upserted}


async def get_edges_for_equipment(
    equipment_id: str,
    *,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    return await db[COLLECTION].find(
        {"equipment_id": equipment_id},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(limit)
