"""
Reliability knowledge graph — lightweight edge store in MongoDB.

Edges link equipment, strategies, failure modes, program tasks, scheduled work,
observations, threats, investigations, actions, and outcomes for traversal
and AI/RIL context assembly.
"""
from __future__ import annotations

import contextvars
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set

from database import db

logger = logging.getLogger(__name__)

COLLECTION = "reliability_edges"
FINDINGS_COLLECTION = "findings"
OUTCOMES_COLLECTION = "outcomes"
RELIABILITY_IMPACTS_COLLECTION = "reliability_impacts"

EDGE_STATUS_ACTIVE = "active"
EDGE_STATUS_RETIRED = "retired"

# Optional WS7 benchmark counter — zero overhead when unset.
_graph_query_counter: contextvars.ContextVar[Optional[List[str]]] = contextvars.ContextVar(
    "graph_query_counter", default=None
)


def reset_graph_query_counter() -> contextvars.Token:
    """Start counting Mongo graph read operations in the current context."""
    return _graph_query_counter.set([])


def restore_graph_query_counter(token: contextvars.Token) -> None:
    _graph_query_counter.reset(token)


def graph_query_count() -> int:
    counter = _graph_query_counter.get()
    return len(counter) if counter is not None else 0


def _record_graph_query(op: str) -> None:
    counter = _graph_query_counter.get()
    if counter is not None:
        counter.append(op)


def _edge_tenant_clause(tenant_id: Optional[str]) -> Dict[str, Any]:
    """Tenant read filter for reliability_edges (strict or migration-safe)."""
    if not tenant_id:
        return {}
    from services.tenant_schema import tenant_read_filter

    return tenant_read_filter({"company_id": tenant_id})


def _merge_edge_query(base: Dict[str, Any], tenant_id: Optional[str]) -> Dict[str, Any]:
    tenant_part = _edge_tenant_clause(tenant_id)
    if not tenant_part:
        return base or {}
    if not base:
        return tenant_part
    return {"$and": [base, tenant_part]}


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
    query = _merge_edge_query(query, tenant_id)
    _record_graph_query("get_edges_for_equipment")
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
    query = _merge_edge_query(query, tenant_id)
    _record_graph_query("get_edges_for_node")
    return await db[COLLECTION].find(query, {"_id": 0}).sort("updated_at", -1).to_list(limit)


async def annotate_equipment_failure_mode_risk(
    *,
    equipment_id: str,
    failure_mode_id: str,
    tenant_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Annotate equipment→failure_mode edge with twin/risk metadata (idempotent upsert)."""
    await upsert_edge(
        source_type="equipment",
        source_id=equipment_id,
        relation="has_failure_mode",
        target_type="failure_mode",
        target_id=str(failure_mode_id),
        equipment_id=equipment_id,
        tenant_id=tenant_id,
        metadata=metadata or {},
    )


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
