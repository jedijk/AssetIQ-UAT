"""
ReliabilityContextService — assemble graph, failure modes, and open work for copilots.

Used by RIL Copilot and other AI endpoints that need a single equipment-centric bundle.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.reliability_graph import get_edges_for_equipment
from services.reliability_graph_query import GraphTraversalService
from services.tenant_schema import merge_tenant_filter, tenant_filter, tenant_id_from_user, with_tenant_id
from services.work_item_query import fetch_work_items

logger = logging.getLogger(__name__)

SNAPSHOT_COLLECTION = "reliability_context_snapshots"
SNAPSHOT_TTL_SECONDS = 120


async def _failure_modes_for_equipment_type(equipment_type_id: Optional[str], *, limit: int = 25) -> List[dict]:
    if not equipment_type_id:
        return []

    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id, "status": "active"},
        {"_id": 0, "failure_mode_strategies": 1},
    )
    fm_strategies = (strategy or {}).get("failure_mode_strategies") or []
    if fm_strategies:
        return [
            {
                "failure_mode_id": fm.get("failure_mode_id"),
                "failure_mode_name": fm.get("failure_mode_name"),
                "strategy_type": fm.get("strategy_type"),
                "criticality": fm.get("criticality"),
                "potential_effects": (fm.get("potential_effects") or [])[:3],
            }
            for fm in fm_strategies[:limit]
        ]

    # Fallback: library failure modes linked to equipment type
    cursor = db.failure_modes.find(
        {"equipment_type_ids": equipment_type_id},
        {"_id": 0, "id": 1, "name": 1, "category": 1, "discipline": 1, "rpn": 1},
    ).limit(limit)
    return await cursor.to_list(limit)


async def build_reliability_context(
    *,
    equipment_id: str,
    user_id: str,
    user: Optional[dict] = None,
    edge_limit: int = 80,
    work_filter: str = "open",
    include_threats: bool = True,
) -> Dict[str, Any]:
    """Build full reliability context for one equipment item."""
    equipment = await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "equipment_type_id": 1, "criticality": 1, "level": 1},
    )
    if not equipment:
        return {"equipment_id": equipment_id, "found": False}

    equipment_type_id = equipment.get("equipment_type_id")
    tid = tenant_id_from_user(user)
    traversal = GraphTraversalService()
    chain = await traversal.get_chain(
        equipment_id, depth=5, user=user, edge_limit=edge_limit
    )
    edges = chain.get("edges") or await get_edges_for_equipment(
        equipment_id, limit=edge_limit, tenant_id=tid
    )
    failure_modes = await _failure_modes_for_equipment_type(equipment_type_id)

    open_work = await fetch_work_items(
        user_id,
        filter_name=work_filter,
        equipment_id=equipment_id,
        user=user,
    )

    program = await db.maintenance_programs_v2.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0, "id": 1, "source_strategy_version": 1, "tasks": 1, "is_active": 1},
    )
    task_count = len((program or {}).get("tasks") or [])

    open_threats: List[dict] = []
    if include_threats:
        threat_query: Dict[str, Any] = {
            "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
            "$or": [
                {"linked_equipment_id": equipment_id},
                {"asset": equipment.get("name")},
            ],
        }
        open_threats = await db.threats.find(
            merge_tenant_filter(threat_query, user),
            {"_id": 0, "id": 1, "title": 1, "failure_mode": 1, "risk_score": 1, "risk_level": 1, "status": 1},
        ).sort("risk_score", -1).limit(15).to_list(15)

    return {
        "found": True,
        "equipment_id": equipment_id,
        "equipment": equipment,
        "equipment_type_id": equipment_type_id,
        "program_task_count": task_count,
        "strategy_version": (program or {}).get("source_strategy_version"),
        "graph": {
            "edges": edges,
            "edge_count": len(edges),
            "relations": _summarize_relations(edges),
            "paths": chain.get("paths", [])[:25],
            "nodes_visited": chain.get("nodes_visited", 0),
        },
        "graph_threat_edges": _count_graph_open_threats(edges),
        "failure_modes": failure_modes,
        "failure_mode_count": len(failure_modes),
        "open_work_items": open_work,
        "open_work_count": len(open_work),
        "open_threats": open_threats,
        "open_threat_count": len(open_threats),
        "assembled_at": datetime.now(timezone.utc).isoformat(),
    }


def _summarize_relations(edges: List[dict]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for edge in edges:
        rel = edge.get("relation") or "unknown"
        counts[rel] = counts.get(rel, 0) + 1
    return counts


def _count_graph_open_threats(edges: List[dict]) -> int:
    threat_ids = set()
    for edge in edges:
        if edge.get("relation") in ("escalated_to", "linked_to_threat") and edge.get("target_type") == "threat":
            tid = edge.get("target_id")
            if tid:
                threat_ids.add(tid)
    return len(threat_ids)


def format_context_for_prompt(ctx: Dict[str, Any]) -> str:
    """Compact text block for LLM system/user prompts."""
    if not ctx.get("found"):
        return f"Equipment {ctx.get('equipment_id')} not found."

    lines = []
    eq = ctx.get("equipment") or {}
    lines.append(f"Equipment: {eq.get('name')} (tag={eq.get('tag')}, id={eq.get('id')})")
    lines.append(f"Program tasks: {ctx.get('program_task_count', 0)}; strategy v={ctx.get('strategy_version')}")
    graph = ctx.get("graph") or {}
    lines.append(f"Graph edges: {graph.get('edge_count', 0)} (nodes visited: {graph.get('nodes_visited', 0)})")
    relations = graph.get("relations") or {}
    if relations:
        top_rels = sorted(relations.items(), key=lambda x: -x[1])[:6]
        lines.append("Graph relations: " + ", ".join(f"{k}={v}" for k, v in top_rels))
    paths = graph.get("paths") or []
    if paths:
        lines.append("Sample chain paths:")
        for path in paths[:4]:
            lines.append(f"  - {' '.join(path)}")

    fms = ctx.get("failure_modes") or []
    if fms:
        lines.append("Failure modes (strategy):")
        for fm in fms[:8]:
            lines.append(f"  - {fm.get('failure_mode_name')} ({fm.get('strategy_type', 'n/a')})")

    work = ctx.get("open_work_items") or []
    if work:
        lines.append(f"Open work ({len(work)}):")
        for item in work[:6]:
            lines.append(f"  - [{item.get('status')}] {item.get('title')} due={item.get('due_date')}")

    threats = ctx.get("open_threats") or []
    if threats:
        lines.append(f"Open threats ({len(threats)}):")
        for t in threats[:5]:
            lines.append(f"  - {t.get('title')} risk={t.get('risk_level')} score={t.get('risk_score')}")

    return "\n".join(lines)


class ReliabilityContextService:
    """Service wrapper with optional snapshot caching."""

    def __init__(self, database=None):
        self.db = database or db

    async def get_context(
        self,
        equipment_id: str,
        user_id: str,
        *,
        user: Optional[dict] = None,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        if use_cache:
            cached = await self._load_snapshot(equipment_id, user)
            if cached:
                return cached

        ctx = await build_reliability_context(
            equipment_id=equipment_id,
            user_id=user_id,
            user=user,
        )
        if ctx.get("found") and use_cache:
            await self._save_snapshot(equipment_id, user, ctx)
        return ctx

    async def _load_snapshot(self, equipment_id: str, user: Optional[dict]) -> Optional[dict]:
        doc = await self.db[SNAPSHOT_COLLECTION].find_one(
            {"equipment_id": equipment_id, **tenant_filter(user)},
            {"_id": 0},
        )
        if not doc:
            return None
        expires = doc.get("expires_at")
        if expires and isinstance(expires, datetime):
            now = datetime.now(timezone.utc)
            exp = expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)
            if exp <= now:
                return None
        return doc.get("context")

    async def _save_snapshot(self, equipment_id: str, user: Optional[dict], ctx: dict) -> None:
        now = datetime.now(timezone.utc)
        expires = now.replace(microsecond=0) + timedelta(seconds=SNAPSHOT_TTL_SECONDS)
        doc = with_tenant_id({
            "equipment_id": equipment_id,
            "context": ctx,
            "updated_at": now,
            "expires_at": expires,
        }, user)
        await self.db[SNAPSHOT_COLLECTION].update_one(
            {"equipment_id": equipment_id, **tenant_filter(user)},
            {"$set": doc},
            upsert=True,
        )
