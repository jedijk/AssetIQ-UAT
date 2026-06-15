"""
Read-side reliability graph — context assembly, traversal, and KPI aggregation.
"""
from __future__ import annotations

from collections import deque
from typing import Any, Dict, List, Optional, Set, Tuple

from database import db
from services.reliability_graph import (
    COLLECTION,
    EDGE_STATUS_RETIRED,
    get_edges_for_equipment,
    get_edges_for_node,
)
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, tenant_read_filter


async def get_equipment_reliability_context(
    equipment_id: str,
    *,
    edge_limit: int = 100,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Bundle graph edges plus lightweight equipment metadata for AI/RIL."""
    tid = tenant_id_from_user(user)
    edges = await get_edges_for_equipment(equipment_id, limit=edge_limit, tenant_id=tid)
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


def _build_active_edge_match(user: Optional[dict] = None, *, active_only: bool = True) -> Dict[str, Any]:
    match: Dict[str, Any] = {}
    if active_only:
        match["status"] = {"$ne": EDGE_STATUS_RETIRED}
    tenant_part = tenant_read_filter(user)
    if tenant_part:
        match = {"$and": [match, tenant_part]} if match else tenant_part
    return match


async def get_graph_topology_stats(
    user: Optional[dict] = None,
    *,
    active_only: bool = True,
) -> Dict[str, Any]:
    """
    Live topology from reliability_edges: relation totals, per-arc counts,
    and per node-type incoming/outgoing counts by relation.
    """
    match = _build_active_edge_match(user, active_only=active_only)
    pipeline: List[Dict[str, Any]] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append(
        {
            "$facet": {
                "by_relation": [
                    {"$group": {"_id": "$relation", "count": {"$sum": 1}}},
                ],
                "by_arc": [
                    {
                        "$group": {
                            "_id": {
                                "relation": "$relation",
                                "source": "$source_type",
                                "target": "$target_type",
                            },
                            "count": {"$sum": 1},
                        }
                    },
                    {"$sort": {"count": -1, "_id.relation": 1}},
                ],
                "outgoing_by_node": [
                    {
                        "$group": {
                            "_id": {
                                "node_type": "$source_type",
                                "relation": "$relation",
                            },
                            "count": {"$sum": 1},
                        }
                    },
                ],
                "incoming_by_node": [
                    {
                        "$group": {
                            "_id": {
                                "node_type": "$target_type",
                                "relation": "$relation",
                            },
                            "count": {"$sum": 1},
                        }
                    },
                ],
            }
        }
    )

    cursor = db[COLLECTION].aggregate(pipeline)
    rows = await cursor.to_list(1)
    facet = rows[0] if rows else {}

    edges_by_relation = {
        row["_id"]: row["count"]
        for row in facet.get("by_relation", [])
        if row.get("_id")
    }

    relation_arcs: List[Dict[str, Any]] = []
    for row in facet.get("by_arc", []):
        arc = row.get("_id") or {}
        relation = arc.get("relation")
        source = arc.get("source")
        target = arc.get("target")
        if not relation or not source or not target:
            continue
        relation_arcs.append(
            {
                "id": f"{relation}:{source}:{target}",
                "relation": relation,
                "source": source,
                "target": target,
                "edge_count": row.get("count", 0),
            }
        )

    outgoing_by_node: Dict[str, Dict[str, int]] = {}
    for row in facet.get("outgoing_by_node", []):
        key = row.get("_id") or {}
        node_type = key.get("node_type")
        relation = key.get("relation")
        if not node_type or not relation:
            continue
        outgoing_by_node.setdefault(node_type, {})[relation] = row.get("count", 0)

    incoming_by_node: Dict[str, Dict[str, int]] = {}
    for row in facet.get("incoming_by_node", []):
        key = row.get("_id") or {}
        node_type = key.get("node_type")
        relation = key.get("relation")
        if not node_type or not relation:
            continue
        incoming_by_node.setdefault(node_type, {})[relation] = row.get("count", 0)

    return {
        "edges_by_relation": edges_by_relation,
        "relation_arcs": relation_arcs,
        "outgoing_by_node": outgoing_by_node,
        "incoming_by_node": incoming_by_node,
    }


async def count_edges_by_relation(
    user: Optional[dict] = None,
    *,
    active_only: bool = True,
) -> Dict[str, int]:
    """Aggregate edge counts by relation type (tenant-scoped intelligence map KPIs)."""
    match = _build_active_edge_match(user, active_only=active_only)

    pipeline: List[Dict[str, Any]] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append({"$group": {"_id": "$relation", "count": {"$sum": 1}}})

    cursor = db[COLLECTION].aggregate(pipeline)
    rows = await cursor.to_list(50)
    return {row["_id"]: row["count"] for row in rows if row.get("_id")}


async def count_active_reliability_edges(user: Optional[dict] = None) -> int:
    """Total active reliability edges for the tenant (matches sum of relation counts)."""
    edges_by_relation = await count_edges_by_relation(user, active_only=True)
    return sum(edges_by_relation.values())


class GraphTraversalService:
    """Read-only bounded BFS traversal over reliability_edges."""

    def __init__(self, database=None):
        self.db = database or db

    async def get_chain(
        self,
        equipment_id: str,
        *,
        depth: int = 5,
        relations: Optional[List[str]] = None,
        user: Optional[dict] = None,
        edge_limit: int = 200,
    ) -> Dict[str, Any]:
        """Bounded BFS from equipment — returns edges and simple path summaries."""
        tid = tenant_id_from_user(user)
        seed_edges = await get_edges_for_equipment(
            equipment_id, limit=edge_limit, tenant_id=tid
        )
        if relations:
            rel_set = set(relations)
            seed_edges = [e for e in seed_edges if e.get("relation") in rel_set]

        visited: Set[Tuple[str, str]] = {(equipment_id, "equipment")}
        collected: List[dict] = []
        seen_edge_ids: Set[str] = set()
        frontier: deque = deque([(equipment_id, "equipment", 0)])
        paths: List[List[str]] = []

        while frontier and len(collected) < edge_limit:
            node_id, node_type, d = frontier.popleft()
            if d >= depth:
                continue
            node_edges = await get_edges_for_node(
                node_type, node_id, tenant_id=tid, limit=edge_limit
            )
            for edge in node_edges:
                eid = edge.get("id")
                if eid and eid in seen_edge_ids:
                    continue
                if relations and edge.get("relation") not in rel_set:
                    continue
                if eid:
                    seen_edge_ids.add(eid)
                collected.append(edge)

                for nid, ntype in (
                    (edge.get("target_id"), edge.get("target_type")),
                    (edge.get("source_id"), edge.get("source_type")),
                ):
                    if not nid or not ntype:
                        continue
                    key = (nid, ntype)
                    if key not in visited:
                        visited.add(key)
                        frontier.append((nid, ntype, d + 1))
                        paths.append([
                            f"{node_type}:{node_id}",
                            f"-[{edge.get('relation')}]->",
                            f"{ntype}:{nid}",
                        ])

        return {
            "equipment_id": equipment_id,
            "depth": depth,
            "edge_count": len(collected),
            "edges": collected[:edge_limit],
            "paths": paths[:50],
            "nodes_visited": len(visited),
        }

    async def get_upstream(
        self,
        node_type: str,
        node_id: str,
        *,
        depth: int = 8,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Provenance walk — edges where node is target."""
        tid = tenant_id_from_user(user)
        edges: List[dict] = []
        frontier: deque = deque([(node_type, node_id, 0)])
        visited: Set[Tuple[str, str]] = set()

        while frontier and len(edges) < 150:
            ntype, nid, d = frontier.popleft()
            key = (ntype, nid)
            if key in visited:
                continue
            visited.add(key)
            if d >= depth:
                continue
            incoming = await get_edges_for_node(
                ntype, nid, direction="in", tenant_id=tid, limit=80
            )
            for edge in incoming:
                edges.append(edge)
                src_type = edge.get("source_type")
                src_id = edge.get("source_id")
                if src_type and src_id:
                    frontier.append((src_type, src_id, d + 1))

        return {
            "node_type": node_type,
            "node_id": node_id,
            "direction": "upstream",
            "edge_count": len(edges),
            "edges": edges,
        }

    async def get_downstream(
        self,
        node_type: str,
        node_id: str,
        *,
        depth: int = 8,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Impact walk — edges where node is source."""
        tid = tenant_id_from_user(user)
        edges: List[dict] = []
        frontier: deque = deque([(node_type, node_id, 0)])
        visited: Set[Tuple[str, str]] = set()

        while frontier and len(edges) < 150:
            ntype, nid, d = frontier.popleft()
            key = (ntype, nid)
            if key in visited:
                continue
            visited.add(key)
            if d >= depth:
                continue
            outgoing = await get_edges_for_node(
                ntype, nid, direction="out", tenant_id=tid, limit=80
            )
            for edge in outgoing:
                edges.append(edge)
                tgt_type = edge.get("target_type")
                tgt_id = edge.get("target_id")
                if tgt_type and tgt_id:
                    frontier.append((tgt_type, tgt_id, d + 1))

        return {
            "node_type": node_type,
            "node_id": node_id,
            "direction": "downstream",
            "edge_count": len(edges),
            "edges": edges,
        }

    async def explain_risk(
        self,
        equipment_id: str,
        *,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Structured open-threat and overdue-PM paths for AI prompts."""
        tid = tenant_id_from_user(user)
        chain = await self.get_chain(
            equipment_id,
            depth=5,
            relations=[
                "observed_on",
                "escalated_to",
                "linked_to_threat",
                "triggered_investigation",
                "generated_action",
                "scheduled_for",
                "mitigates_failure_mode",
                "indicates_failure_mode",
            ],
            user=user,
        )

        open_threat_query = merge_tenant_filter({
            "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
            "$or": [
                {"linked_equipment_id": equipment_id},
            ],
        }, user)
        open_threats = await self.db.threats.find(
            open_threat_query,
            {"_id": 0, "id": 1, "title": 1, "risk_level": 1, "risk_score": 1},
        ).sort("risk_score", -1).limit(10).to_list(10)

        graph_threat_ids = {
            e.get("target_id")
            for e in chain["edges"]
            if e.get("relation") in ("escalated_to", "linked_to_threat")
            and e.get("target_type") == "threat"
        }

        overdue_pm = await self.db.scheduled_tasks.count_documents(
            merge_tenant_filter({
                "equipment_id": equipment_id,
                "status": {"$nin": ["completed", "cancelled"]},
            }, user)
        )

        path_entries = []
        for edge in chain.get("edges", [])[:40]:
            eid = edge.get("id")
            if not eid:
                continue
            path_entries.append({
                "edge_id": eid,
                "relation": edge.get("relation"),
                "source": f"{edge.get('source_type')}:{edge.get('source_id')}",
                "target": f"{edge.get('target_type')}:{edge.get('target_id')}",
            })

        return {
            "equipment_id": equipment_id,
            "open_threat_count": len(open_threats),
            "graph_linked_threat_count": len(graph_threat_ids),
            "open_threats": open_threats,
            "overdue_pm_scheduled": overdue_pm,
            "risk_paths": chain.get("paths", [])[:20],
            "path_entries": path_entries,
            "relevant_edges": chain.get("edges", [])[:40],
            "tenant_id": tid,
        }


# Backward-compatible alias
async def sync_observation_edge(
    *,
    observation_id: str,
    equipment_id: Optional[str],
    failure_mode_id: Optional[str] = None,
    threat_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    from services.reliability_graph import dispatch_graph_sync

    await dispatch_graph_sync(
        "sync_observation_edges",
        "observation_edge",
        observation_id=observation_id,
        equipment_id=equipment_id,
        failure_mode_id=failure_mode_id,
        threat_id=threat_id,
        tenant_id=tenant_id,
    )
