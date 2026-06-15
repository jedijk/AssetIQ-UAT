"""
Reliability knowledge graph — lightweight edge store in MongoDB.

Edges link equipment, strategies, failure modes, program tasks, scheduled work,
observations, threats, investigations, actions, and outcomes for traversal
and AI/RIL context assembly.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set

from database import db

from services.program_task_resolution import resolve_program_task_id

logger = logging.getLogger(__name__)

COLLECTION = "reliability_edges"
FINDINGS_COLLECTION = "findings"
OUTCOMES_COLLECTION = "outcomes"
RELIABILITY_IMPACTS_COLLECTION = "reliability_impacts"

EDGE_STATUS_ACTIVE = "active"
EDGE_STATUS_RETIRED = "retired"


async def _run_graph_sync(coro, label: str) -> None:
    """Execute graph sync inline; log-and-continue unless strict/audit mode is enabled."""
    from services.reliability_graph_strict import graph_sync_strict

    try:
        await coro
    except Exception as exc:
        logger.warning("%s graph sync failed: %s", label, exc)
        if graph_sync_strict():
            raise


def graph_sync_async_enabled() -> bool:
    """When true, graph sync is enqueued via domain event outbox instead of blocking requests."""
    return os.environ.get("GRAPH_SYNC_ASYNC", "false").lower() == "true"


_GRAPH_SYNC_EVENT_TYPES: Dict[str, str] = {}


def _graph_event_type(sync_name: str) -> str:
    if sync_name not in _GRAPH_SYNC_EVENT_TYPES:
        from services.domain_events import DomainEventType

        mapping = {
            "sync_observation_edges": DomainEventType.GRAPH_SYNC_OBSERVATION.value,
            "sync_threat_edges": DomainEventType.GRAPH_SYNC_THREAT.value,
            "sync_investigation_edges": DomainEventType.GRAPH_SYNC_INVESTIGATION.value,
            "sync_cause_edge": DomainEventType.GRAPH_SYNC_CAUSE.value,
            "sync_action_edges": DomainEventType.GRAPH_SYNC_ACTION.value,
            "sync_outcome_edges": DomainEventType.GRAPH_SYNC_OUTCOME.value,
            "sync_edges_for_scheduled_task": DomainEventType.GRAPH_SYNC_SCHEDULED_TASK.value,
            "sync_task_instance_completion_edges": DomainEventType.GRAPH_SYNC_TASK_COMPLETION.value,
            "sync_edges_for_apply_strategy": DomainEventType.GRAPH_SYNC_APPLY_STRATEGY.value,
            "sync_edge_for_pm_import_task": "graph.sync_edge_for_pm_import_task",
        }
        _GRAPH_SYNC_EVENT_TYPES.update(mapping)
    return _GRAPH_SYNC_EVENT_TYPES.get(sync_name, f"graph.{sync_name}")


async def dispatch_graph_sync(sync_name: str, label: str, **kwargs: Any) -> None:
    """
    Run graph sync inline or enqueue via outbox when GRAPH_SYNC_ASYNC=true.

    All write-path graph updates should use this instead of calling sync_* directly.
    """
    if graph_sync_async_enabled():
        from services.event_outbox import publish_event

        aggregate_id = (
            kwargs.get("observation_id")
            or kwargs.get("threat_id")
            or kwargs.get("investigation_id")
            or kwargs.get("action_id")
            or kwargs.get("task_instance_id")
            or kwargs.get("equipment_type_id")
            or (kwargs.get("scheduled_task") or {}).get("id")
            or label
        )
        await publish_event(
            event_type=_graph_event_type(sync_name),
            aggregate_type="reliability_graph",
            aggregate_id=str(aggregate_id),
            payload={"sync_name": sync_name, "kwargs": kwargs, "label": label},
            tenant_id=kwargs.get("tenant_id"),
        )
        try:
            from services.observability_metrics import inc
            inc("graph_sync_enqueued_total")
        except Exception:
            pass
        return

    handler = GRAPH_SYNC_HANDLERS.get(sync_name)
    if not handler:
        raise ValueError(f"unknown graph sync handler: {sync_name}")

    if sync_name == "sync_edges_for_scheduled_task":
        task_doc = kwargs.get("scheduled_task") or kwargs.get("task_doc") or {}
        event_name = kwargs.get("event", "created")
        await _run_graph_sync(handler(task_doc, event=event_name), label)
        return

    await _run_graph_sync(handler(**kwargs), label)
    try:
        from services.observability_metrics import inc
        inc("graph_sync_inline_total")
    except Exception:
        pass


def edge_document_id(
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
) -> str:
    return f"{source_type}:{source_id}:{relation}:{target_type}:{target_id}"


async def upsert_edge(
    *,
    source_type: str,
    source_id: str,
    relation: str,
    target_type: str,
    target_id: str,
    equipment_type_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    status: str = EDGE_STATUS_ACTIVE,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    edge_id = edge_document_id(source_type, source_id, relation, target_type, target_id)
    doc = {
        "id": edge_id,
        "source_type": source_type,
        "source_id": source_id,
        "relation": relation,
        "target_type": target_type,
        "target_id": target_id,
        "equipment_type_id": equipment_type_id,
        "equipment_id": equipment_id,
        "status": status,
        "metadata": metadata or {},
        "updated_at": now,
        "retired_at": None,
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    await db[COLLECTION].update_one(
        {"id": edge_id},
        {
            "$set": doc,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def retire_edges_for_entity(
    *,
    source_type: str,
    source_id: str,
    tenant_id: Optional[str] = None,
) -> int:
    """Soft-retire all active edges where entity is source or target."""
    now = datetime.now(timezone.utc).isoformat()
    query: Dict[str, Any] = {
        "status": EDGE_STATUS_ACTIVE,
        "$or": [
            {"source_type": source_type, "source_id": source_id},
            {"target_type": source_type, "target_id": source_id},
        ],
    }
    if tenant_id:
        query["tenant_id"] = tenant_id
    result = await db[COLLECTION].update_many(
        query,
        {"$set": {"status": EDGE_STATUS_RETIRED, "retired_at": now, "updated_at": now}},
    )
    return result.modified_count


async def retire_stale_program_task_edges(
    *,
    equipment_id: str,
    active_task_ids: Set[str],
    tenant_id: Optional[str] = None,
) -> int:
    """Retire program_task edges for tasks no longer in the active program."""
    now = datetime.now(timezone.utc).isoformat()
    query: Dict[str, Any] = {
        "equipment_id": equipment_id,
        "source_type": "program_task",
        "status": EDGE_STATUS_ACTIVE,
    }
    if active_task_ids:
        query["source_id"] = {"$nin": list(active_task_ids)}
    if tenant_id:
        query["tenant_id"] = tenant_id
    result = await db[COLLECTION].update_many(
        query,
        {"$set": {"status": EDGE_STATUS_RETIRED, "retired_at": now, "updated_at": now}},
    )
    return result.modified_count


async def ensure_reliability_graph_indexes(database=None) -> int:
    """Create compound indexes for tenant-scoped graph reads (idempotent)."""
    coll = (database if database is not None else db)[COLLECTION]
    specs = [
        ([("tenant_id", 1), ("equipment_id", 1), ("status", 1), ("updated_at", -1)], "rg_tenant_eq_status_updated"),
        ([("tenant_id", 1), ("source_type", 1), ("source_id", 1)], "rg_tenant_source"),
        ([("tenant_id", 1), ("target_type", 1), ("target_id", 1)], "rg_tenant_target"),
        ([("tenant_id", 1), ("relation", 1)], "rg_tenant_relation"),
    ]
    created = 0
    for keys, name in specs:
        try:
            await coll.create_index(keys, name=name, background=True)
            created += 1
        except Exception:
            pass
    return created


def _failure_mode_ids_from_strategy(strategy: dict) -> List[str]:
    ids: List[str] = []
    for fm in strategy.get("failure_mode_strategies") or []:
        fm_id = fm.get("failure_mode_id")
        if fm_id:
            ids.append(str(fm_id))
    return ids


async def sync_edges_for_apply_strategy(
    *,
    equipment_type_id: str,
    equipment_ids: List[str],
    strategy_version: str,
    tenant_id: Optional[str] = None,
) -> Dict[str, int]:
    """
    Materialize graph edges after Apply Strategy:
    equipment → strategy/program/failure_mode, program → strategy/tasks, task → failure_mode.
    """
    created = 0
    retired = 0
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0},
    )
    if not strategy:
        return {"edges_upserted": 0, "edges_retired": 0}

    fm_ids = _failure_mode_ids_from_strategy(strategy)

    programs_cursor = db.maintenance_programs_v2.find(
        {"equipment_id": {"$in": list(equipment_ids)}},
        {"_id": 0},
    )
    programs = await programs_cursor.to_list(len(equipment_ids) or 1)
    program_by_equipment = {
        p["equipment_id"]: p for p in programs if p.get("equipment_id")
    }

    for equipment_id in equipment_ids:
        for fm_id in fm_ids:
            await upsert_edge(
                source_type="equipment",
                source_id=equipment_id,
                relation="has_failure_mode",
                target_type="failure_mode",
                target_id=fm_id,
                equipment_type_id=equipment_type_id,
                equipment_id=equipment_id,
                tenant_id=tenant_id,
                metadata={"strategy_version": strategy_version},
            )
            created += 1

        await upsert_edge(
            source_type="equipment",
            source_id=equipment_id,
            relation="has_strategy_type",
            target_type="equipment_type_strategy",
            target_id=equipment_type_id,
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
            metadata={"strategy_version": strategy_version},
        )
        created += 1

        program = program_by_equipment.get(equipment_id)
        if not program:
            continue

        program_id = program.get("id") or equipment_id
        active_task_ids: Set[str] = set()

        await upsert_edge(
            source_type="equipment",
            source_id=equipment_id,
            relation="has_program",
            target_type="maintenance_program_v2",
            target_id=program_id,
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
            metadata={"source_strategy_version": program.get("source_strategy_version")},
        )
        created += 1

        await upsert_edge(
            source_type="maintenance_program_v2",
            source_id=program_id,
            relation="governed_by",
            target_type="equipment_type_strategy",
            target_id=equipment_type_id,
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
            metadata={"strategy_version": strategy_version},
        )
        created += 1

        for task in program.get("tasks") or []:
            task_id = task.get("id")
            if not task_id:
                continue
            active_task_ids.add(task_id)

            await upsert_edge(
                source_type="maintenance_program_v2",
                source_id=program_id,
                relation="contains_task",
                target_type="program_task",
                target_id=task_id,
                equipment_type_id=equipment_type_id,
                equipment_id=equipment_id,
                tenant_id=tenant_id,
            )
            created += 1

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
                    tenant_id=tenant_id,
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
                    tenant_id=tenant_id,
                )
                created += 1

            pm_import_ref = trace.get("pm_import_task_id")
            if pm_import_ref:
                created += await sync_pm_import_program_task_links(
                    pm_import_task_id=str(pm_import_ref),
                    program_task_id=task_id,
                    failure_mode_id=fm_id,
                    equipment_id=equipment_id,
                    equipment_type_id=equipment_type_id,
                    tenant_id=tenant_id,
                    apply_mode="apply_strategy",
                )

        retired += await retire_stale_program_task_edges(
            equipment_id=equipment_id,
            active_task_ids=active_task_ids,
            tenant_id=tenant_id,
        )

    return {"edges_upserted": created, "edges_retired": retired}


async def sync_edge_for_pm_import_task(
    *,
    task_id: str,
    failure_mode_id: str,
    equipment_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    apply_mode: str = "added",
    tenant_id: Optional[str] = None,
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
        tenant_id=tenant_id,
        metadata={"apply_mode": apply_mode},
    )


async def sync_pm_import_program_task_links(
    *,
    pm_import_task_id: str,
    program_task_id: str,
    failure_mode_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    apply_mode: str = "program_sync",
) -> int:
    """Link a PM import staging task to its program task (and failure mode when known)."""
    upserted = 0
    await upsert_edge(
        source_type="pm_import_task",
        source_id=pm_import_task_id,
        relation="imported_as",
        target_type="program_task",
        target_id=program_task_id,
        equipment_id=equipment_id,
        equipment_type_id=equipment_type_id,
        tenant_id=tenant_id,
        metadata={"apply_mode": apply_mode},
    )
    upserted += 1
    if failure_mode_id:
        await sync_edge_for_pm_import_task(
            task_id=pm_import_task_id,
            failure_mode_id=failure_mode_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            apply_mode=apply_mode,
            tenant_id=tenant_id,
        )
        upserted += 1
    return upserted


async def sync_edges_for_scheduled_task(
    scheduled_task: dict,
    *,
    event: str,
    metadata: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None,
) -> Dict[str, int]:
    """
    Materialize scheduled_task graph edges on lifecycle events.

    Base edges (always):
      scheduled_task → derived_from → program_task
      scheduled_task → scheduled_for → equipment
      scheduled_task → mitigates_failure_mode → failure_mode (when present)

    Lifecycle edges:
      created — base edges only (planner horizon visibility)
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
            tenant_id=tenant_id,
            metadata=base_meta,
        )
        upserted += 1

    pm_import_id = scheduled_task.get("pm_import_task_id")
    if pm_import_id and program_task_id:
        upserted += await sync_pm_import_program_task_links(
            pm_import_task_id=str(pm_import_id),
            program_task_id=program_task_id,
            failure_mode_id=failure_mode_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            tenant_id=tenant_id,
            apply_mode="scheduled_sync",
        )

    if equipment_id:
        await upsert_edge(
            source_type="scheduled_task",
            source_id=task_id,
            relation="scheduled_for",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            equipment_type_id=equipment_type_id,
            tenant_id=tenant_id,
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
            tenant_id=tenant_id,
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
            tenant_id=tenant_id,
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
            tenant_id=tenant_id,
            metadata=event_meta,
        )
        upserted += 1

    return {"edges_upserted": upserted}


async def sync_instantiated_as_edge(
    *,
    scheduled_task_id: str,
    task_instance_id: str,
    equipment_id: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Bridge scheduled_task → task_instance on execution."""
    await upsert_edge(
        source_type="scheduled_task",
        source_id=scheduled_task_id,
        relation="instantiated_as",
        target_type="task_instance",
        target_id=task_instance_id,
        equipment_id=equipment_id,
        equipment_type_id=equipment_type_id,
        tenant_id=tenant_id,
        metadata=metadata,
    )


async def sync_task_instance_completion_edges(
    *,
    task_instance_id: str,
    equipment_id: Optional[str],
    failure_mode_id: Optional[str],
    scheduled_task_id: Optional[str],
    completed_at: str,
    tenant_id: Optional[str] = None,
    findings_text: Optional[str] = None,
) -> Dict[str, Any]:
    """Upsert task_instance edges and optional finding on completion."""
    result: Dict[str, Any] = {"edges_upserted": 0, "finding_id": None}
    completion_id = f"ti:{task_instance_id}"

    if scheduled_task_id:
        await sync_instantiated_as_edge(
            scheduled_task_id=scheduled_task_id,
            task_instance_id=task_instance_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
            metadata={"completed_at": completed_at},
        )
        result["edges_upserted"] += 1

    if equipment_id:
        await upsert_edge(
            source_type="task_instance",
            source_id=task_instance_id,
            relation="executed_on",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
            metadata={"completed_at": completed_at, "task_completion_id": completion_id},
        )
        result["edges_upserted"] += 1

    if failure_mode_id:
        await upsert_edge(
            source_type="task_instance",
            source_id=task_instance_id,
            relation="mitigates_failure_mode",
            target_type="failure_mode",
            target_id=str(failure_mode_id),
            equipment_id=equipment_id,
            tenant_id=tenant_id,
            metadata={"completed_at": completed_at},
        )
        result["edges_upserted"] += 1

    if findings_text and findings_text.strip() and equipment_id:
        finding_id = await _sync_finding_from_completion(
            completion_id=completion_id,
            equipment_id=equipment_id,
            source_type="task_instance",
            source_id=task_instance_id,
            findings_text=findings_text.strip(),
            tenant_id=tenant_id,
            completed_at=completed_at,
        )
        result["finding_id"] = finding_id
        if finding_id:
            result["edges_upserted"] += 2

    return result


async def _sync_finding_from_completion(
    *,
    completion_id: str,
    equipment_id: str,
    source_type: str,
    source_id: str,
    findings_text: str,
    tenant_id: Optional[str],
    completed_at: str,
) -> Optional[str]:
    """Create finding doc and graph edges from task completion findings."""
    finding_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc: Dict[str, Any] = {
        "id": finding_id,
        "equipment_id": equipment_id,
        "source_type": source_type,
        "source_id": source_id,
        "text": findings_text[:4000],
        "created_at": now,
    }
    if tenant_id:
        doc["tenant_id"] = tenant_id
    await db[FINDINGS_COLLECTION].insert_one(doc)

    await upsert_edge(
        source_type="task_completion",
        source_id=completion_id,
        relation="yielded_finding",
        target_type="finding",
        target_id=finding_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"completed_at": completed_at, "source_type": source_type},
    )
    await upsert_edge(
        source_type="finding",
        source_id=finding_id,
        relation="found_on",
        target_type="equipment",
        target_id=equipment_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"completed_at": completed_at},
    )
    return finding_id


async def sync_finding_to_observation_edge(
    *,
    finding_id: str,
    observation_id: str,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Link finding → observation when triaged from maintenance."""
    await upsert_edge(
        source_type="finding",
        source_id=finding_id,
        relation="raised_observation",
        target_type="observation",
        target_id=observation_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
    )


async def sync_observation_edges(
    *,
    observation_id: str,
    equipment_id: Optional[str],
    failure_mode_id: Optional[str] = None,
    threat_id: Optional[str] = None,
    finding_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    escalate: bool = False,
) -> None:
    """Materialize observation graph edges (equipment, FM, threat links)."""
    if equipment_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="observed_on",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if failure_mode_id:
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation="indicates_failure_mode",
            target_type="failure_mode",
            target_id=str(failure_mode_id),
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if threat_id:
        relation = "escalated_to" if escalate else "linked_to_threat"
        await upsert_edge(
            source_type="observation",
            source_id=observation_id,
            relation=relation,
            target_type="threat",
            target_id=threat_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
        if not escalate:
            await upsert_edge(
                source_type="observation",
                source_id=observation_id,
                relation="escalated_to",
                target_type="threat",
                target_id=threat_id,
                equipment_id=equipment_id,
                tenant_id=tenant_id,
            )
    if finding_id:
        await sync_finding_to_observation_edge(
            finding_id=finding_id,
            observation_id=observation_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )


async def sync_threat_edges(
    *,
    threat_id: str,
    equipment_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    observation_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize threat → equipment / failure_mode edges."""
    if equipment_id:
        await upsert_edge(
            source_type="threat",
            source_id=threat_id,
            relation="linked_to_equipment",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if failure_mode_id:
        await upsert_edge(
            source_type="threat",
            source_id=threat_id,
            relation="indicates_failure_mode",
            target_type="failure_mode",
            target_id=str(failure_mode_id),
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )
    if observation_id:
        await sync_observation_edges(
            observation_id=observation_id,
            equipment_id=equipment_id,
            failure_mode_id=failure_mode_id,
            threat_id=threat_id,
            tenant_id=tenant_id,
            escalate=True,
        )


async def sync_investigation_edges(
    *,
    investigation_id: str,
    threat_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize threat → investigation on investigation open."""
    if threat_id:
        await upsert_edge(
            source_type="threat",
            source_id=threat_id,
            relation="triggered_investigation",
            target_type="investigation",
            target_id=investigation_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )


async def sync_cause_edge(
    *,
    investigation_id: str,
    cause_id: str,
    equipment_id: Optional[str] = None,
    is_root_cause: bool = False,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize investigation → cause on RCA."""
    await upsert_edge(
        source_type="investigation",
        source_id=investigation_id,
        relation="identified_cause",
        target_type="cause",
        target_id=cause_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"is_root_cause": is_root_cause},
    )


async def sync_action_edges(
    *,
    action_id: str,
    source_type: str,
    source_id: str,
    equipment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Materialize investigation/cause/threat → action and action → equipment."""
    await upsert_edge(
        source_type=source_type,
        source_id=source_id,
        relation="generated_action",
        target_type="action",
        target_id=action_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
    )
    if equipment_id:
        await upsert_edge(
            source_type="action",
            source_id=action_id,
            relation="assigned_to_equipment",
            target_type="equipment",
            target_id=equipment_id,
            equipment_id=equipment_id,
            tenant_id=tenant_id,
        )


async def sync_outcome_edges(
    *,
    action_id: str,
    outcome_id: str,
    equipment_id: str,
    verification_status: str = "verified",
    effectiveness: Optional[str] = None,
    metric_type: str = "mtbf_proxy_days",
    delta: Optional[float] = None,
    window_days: int = 90,
    tenant_id: Optional[str] = None,
) -> Dict[str, str]:
    """
    Close the reliability loop: action → outcome → reliability_impact → equipment.
    Creates outcome and reliability_impact documents plus graph edges.
    """
    now = datetime.now(timezone.utc).isoformat()
    outcome_doc: Dict[str, Any] = {
        "id": outcome_id,
        "action_id": action_id,
        "verification_status": verification_status,
        "verified_at": now,
        "effectiveness": effectiveness,
        "equipment_id": equipment_id,
        "created_at": now,
    }
    if tenant_id:
        outcome_doc["tenant_id"] = tenant_id
    await db[OUTCOMES_COLLECTION].insert_one(outcome_doc)

    impact_id = str(uuid.uuid4())
    impact_doc: Dict[str, Any] = {
        "id": impact_id,
        "outcome_id": outcome_id,
        "equipment_id": equipment_id,
        "metric_type": metric_type,
        "delta": delta,
        "window_days": window_days,
        "created_at": now,
    }
    if tenant_id:
        impact_doc["tenant_id"] = tenant_id
    await db[RELIABILITY_IMPACTS_COLLECTION].insert_one(impact_doc)

    await upsert_edge(
        source_type="action",
        source_id=action_id,
        relation="resulted_in",
        target_type="outcome",
        target_id=outcome_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"verification_status": verification_status},
    )
    await upsert_edge(
        source_type="outcome",
        source_id=outcome_id,
        relation="impacted_reliability",
        target_type="reliability_impact",
        target_id=impact_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"metric_type": metric_type, "delta": delta},
    )
    await upsert_edge(
        source_type="reliability_impact",
        source_id=impact_id,
        relation="affects_equipment",
        target_type="equipment",
        target_id=equipment_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={"window_days": window_days},
    )
    return {"outcome_id": outcome_id, "impact_id": impact_id}


async def get_edges_for_equipment(
    equipment_id: str,
    *,
    limit: int = 200,
    tenant_id: Optional[str] = None,
    include_retired: bool = False,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"equipment_id": equipment_id}
    if not include_retired:
        query["status"] = {"$ne": EDGE_STATUS_RETIRED}
    if tenant_id:
        query["$or"] = [
            {"tenant_id": tenant_id},
            {"tenant_id": {"$exists": False}},
        ]
    return await db[COLLECTION].find(
        query,
        {"_id": 0},
    ).sort("updated_at", -1).to_list(limit)


async def get_edges_for_node(
    node_type: str,
    node_id: str,
    *,
    direction: str = "both",
    limit: int = 100,
    tenant_id: Optional[str] = None,
    include_retired: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch edges where node is source, target, or both."""
    clauses: List[Dict[str, Any]] = []
    if direction in ("out", "both"):
        clauses.append({"source_type": node_type, "source_id": node_id})
    if direction in ("in", "both"):
        clauses.append({"target_type": node_type, "target_id": node_id})
    query: Dict[str, Any] = {"$or": clauses}
    if not include_retired:
        query["status"] = {"$ne": EDGE_STATUS_RETIRED}
    if tenant_id:
        query = {
            "$and": [
                query,
                {"$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]},
            ]
        }
    return await db[COLLECTION].find(query, {"_id": 0}).sort("updated_at", -1).to_list(limit)


async def sync_prediction_edges(
    *,
    equipment_id: str,
    graph_edge_hint: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None,
    owner_id: Optional[str] = None,
    prediction_version: Optional[int] = None,
) -> None:
    """Materialize equipment → prediction edge when graph_edge_hint is present (v1.2)."""
    if not equipment_id or not graph_edge_hint:
        return
    edge_count = int(graph_edge_hint.get("active_edge_count") or 0)
    if edge_count <= 0:
        return
    target_id = f"{equipment_id}:v{prediction_version or 'latest'}"
    await upsert_edge(
        source_type="equipment",
        source_id=equipment_id,
        relation="has_prediction",
        target_type="prediction",
        target_id=target_id,
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata={
            "active_edge_count": edge_count,
            "owner_id": owner_id,
            "model_version": "1.2",
        },
    )


# Registry for dispatch_graph_sync — populated after handler definitions.
GRAPH_SYNC_HANDLERS: Dict[str, Callable[..., Any]] = {
    "sync_observation_edges": sync_observation_edges,
    "sync_threat_edges": sync_threat_edges,
    "sync_investigation_edges": sync_investigation_edges,
    "sync_prediction_edges": sync_prediction_edges,
    "sync_cause_edge": sync_cause_edge,
    "sync_action_edges": sync_action_edges,
    "sync_outcome_edges": sync_outcome_edges,
    "sync_edges_for_scheduled_task": sync_edges_for_scheduled_task,
    "sync_task_instance_completion_edges": sync_task_instance_completion_edges,
    "sync_edges_for_apply_strategy": sync_edges_for_apply_strategy,
    "sync_edge_for_pm_import_task": sync_edge_for_pm_import_task,
}
