"""
Graph-native KPI aggregation for executive dashboard and intelligence map.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db, installation_filter
from services.reliability_graph import COLLECTION, EDGE_STATUS_RETIRED
from services.reliability_graph_query import GraphTraversalService, count_edges_by_relation
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user


async def _equipment_scope_filter(user: Optional[dict]) -> Dict[str, Any]:
    if not user:
        return {}
    installation_ids = await installation_filter.get_user_installation_ids(user)
    if not installation_ids:
        return {"_impossible": True}
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, user.get("id")
    )
    if not equipment_ids:
        return {"_impossible": True}
    return {"linked_equipment_id": {"$in": list(equipment_ids)}}


async def count_open_threats_from_graph(
    equipment_ids: List[str],
    *,
    user: Optional[dict] = None,
) -> int:
    """Count distinct open threats linked via active graph edges."""
    tid = tenant_id_from_user(user)
    match: Dict[str, Any] = {
        "equipment_id": {"$in": equipment_ids},
        "relation": {"$in": ["escalated_to", "linked_to_threat", "observed_on"]},
        "target_type": "threat",
        "status": {"$ne": EDGE_STATUS_RETIRED},
    }
    if tid:
        match["$or"] = [{"tenant_id": tid}, {"tenant_id": {"$exists": False}}]

    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$target_id"}},
        {"$count": "count"},
    ]
    rows = await db[COLLECTION].aggregate(pipeline).to_list(1)
    if rows:
        return rows[0]["count"]

    # Fallback: Mongo FK count
    scope = await _equipment_scope_filter(user)
    if scope.get("_impossible"):
        return 0
    return await db.threats.count_documents(merge_tenant_filter({
        **scope,
        "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
    }, user))


class GraphKpiAggregator:
    """Align executive KPIs with graph traversal where possible."""

    def __init__(self, database=None):
        self.db = database or db
        self.traversal = GraphTraversalService(self.db)

    async def aggregate(
        self,
        user: Optional[dict] = None,
        *,
        equipment_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        scope = await _equipment_scope_filter(user)
        if user and scope.get("_impossible"):
            return self._empty(now)

        if equipment_ids is None and scope.get("linked_equipment_id"):
            equipment_ids = scope["linked_equipment_id"]["$in"]

        relation_counts = await count_edges_by_relation(user, active_only=True)
        total_active_edges = sum(relation_counts.values())

        open_threats_mongo = await self.db.threats.count_documents(
            merge_tenant_filter({
                **scope,
                "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
            }, user)
        )

        graph_open_threats = 0
        if equipment_ids:
            graph_open_threats = await count_open_threats_from_graph(
                list(equipment_ids), user=user
            )

        high_risk = await self.db.threats.count_documents(merge_tenant_filter({
            **scope,
            "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
            "risk_level": {"$in": ["High", "high", "Critical", "critical"]},
        }, user))

        today_iso = now.date().isoformat()
        pm_scope: Dict[str, Any] = {}
        if equipment_ids:
            pm_scope["equipment_id"] = {"$in": list(equipment_ids)}
        overdue_scheduled = await self.db.scheduled_tasks.count_documents(
            merge_tenant_filter({
                **pm_scope,
                "status": {"$nin": ["completed", "cancelled"]},
                "due_date": {"$lt": today_iso},
            }, user)
        )

        chain_depth_samples: List[Dict[str, Any]] = []
        if equipment_ids:
            for eq_id in list(equipment_ids)[:5]:
                chain = await self.traversal.get_chain(eq_id, depth=4, user=user, edge_limit=50)
                chain_depth_samples.append({
                    "equipment_id": eq_id,
                    "edge_count": chain.get("edge_count", 0),
                    "nodes_visited": chain.get("nodes_visited", 0),
                })

        return {
            "open_threats": open_threats_mongo,
            "open_threats_graph": graph_open_threats,
            "open_threats_aligned": open_threats_mongo == graph_open_threats,
            "high_risk_threats": high_risk,
            "overdue_pm_scheduled": overdue_scheduled,
            "reliability_edges_active": total_active_edges,
            "edges_by_relation": relation_counts,
            "chain_depth_samples": chain_depth_samples,
            "generated_at": now.isoformat(),
            "source": "graph_kpi_aggregator",
        }

    def _empty(self, now: datetime) -> Dict[str, Any]:
        return {
            "open_threats": 0,
            "open_threats_graph": 0,
            "open_threats_aligned": True,
            "high_risk_threats": 0,
            "overdue_pm_scheduled": 0,
            "reliability_edges_active": 0,
            "edges_by_relation": {},
            "chain_depth_samples": [],
            "generated_at": now.isoformat(),
            "source": "graph_kpi_aggregator",
        }
