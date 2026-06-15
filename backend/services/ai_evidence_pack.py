"""
Shared evidence assembly for grounded AI — Convergence Phase 4.

Composes existing reliability services into a single tenant-scoped evidence dict.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from database import db
from services.ai_citation import make_citation
from services.equipment_reliability_state_service import (
    build_equipment_reliability_state,
    compute_fleet_reliability_summary,
)
from services.reliability_context_service import (
    ReliabilityContextService,
    format_context_for_prompt,
)
from services.reliability_graph_query import GraphTraversalService
from services.ril_service_factory import ril_owner_id
from services.tenant_schema import merge_tenant_filter
from services.work_signal_projection import project_list_item

logger = logging.getLogger(__name__)


def _equipment_url(equipment_id: str) -> str:
    return f"/equipment/{equipment_id}"


def _threat_url(threat_id: str) -> str:
    return f"/threats/{threat_id}"


def _graph_edge_url(edge_id: str, equipment_id: str) -> str:
    return f"/equipment/{equipment_id}/reliability-graph?edge={edge_id}"


async def build_evidence_pack(
    *,
    user: Optional[dict],
    equipment_id: Optional[str] = None,
    intent: Optional[str] = None,
    include_fleet: bool = False,
    database=None,
) -> Dict[str, Any]:
    """
    Assemble structured evidence for grounded AI prompts.

    Returns dict with: entities, kpis, graph_edges, citations, prompt_summary.
    """
    conn = database or db
    user_id = (user or {}).get("id") or ril_owner_id(user) if user else "anonymous"

    entities: List[Dict[str, Any]] = []
    kpis: Dict[str, Any] = {}
    graph_edges: List[Dict[str, Any]] = []
    citations: List[Dict[str, str]] = []
    open_signals: List[Dict[str, Any]] = []
    ctx: Dict[str, Any] = {}

    if include_fleet or (intent in ("general_summary", "attention_required", "fleet") and not equipment_id):
        fleet = await compute_fleet_reliability_summary(user=user)
        kpis["fleet"] = fleet
        citations.append(
            make_citation(
                id="fleet-reliability",
                type="kpi",
                label="Fleet reliability summary",
                url_path="/executive",
            )
        )

    if equipment_id:
        state_task = build_equipment_reliability_state(equipment_id, user_id, user=user)
        risk_task = GraphTraversalService(conn).explain_risk(equipment_id, user=user)
        ctx_task = ReliabilityContextService(conn).get_context(
            equipment_id, user_id, user=user, use_cache=True
        )
        state, risk, ctx = await asyncio.gather(state_task, risk_task, ctx_task)

        if state.get("found"):
            kpis["equipment"] = {
                "health_score": state.get("health_score"),
                "risk_level": state.get("risk_level"),
                "open_observation_count": state.get("open_observation_count"),
                "overdue_pm_count": state.get("overdue_pm_count"),
                "exposure_score": (state.get("exposure") or {}).get("score"),
                "graph_edge_count": state.get("graph_edge_count"),
                "canonical_source": state.get("canonical_source"),
            }
            entities.append(
                {
                    "type": "equipment",
                    "id": equipment_id,
                    "risk_level": state.get("risk_level"),
                    "health_score": state.get("health_score"),
                }
            )
            eq_label = equipment_id
            if ctx.get("equipment"):
                eq = ctx["equipment"]
                eq_label = f"{eq.get('name') or equipment_id} ({eq.get('tag') or 'n/a'})"
            citations.append(
                make_citation(
                    id=equipment_id,
                    type="equipment",
                    label=eq_label,
                    url_path=_equipment_url(equipment_id),
                )
            )

        path_entries = risk.get("path_entries") or []
        for entry in path_entries[:20]:
            edge_id = entry.get("edge_id")
            if not edge_id:
                continue
            graph_edges.append(
                {
                    "edge_id": edge_id,
                    "relation": entry.get("relation"),
                    "source": entry.get("source"),
                    "target": entry.get("target"),
                }
            )
            citations.append(
                make_citation(
                    id=str(edge_id),
                    type="graph_edge",
                    label=f"{entry.get('source')} -[{entry.get('relation')}]-> {entry.get('target')}",
                    url_path=_graph_edge_url(str(edge_id), equipment_id),
                )
            )

        for threat in (ctx.get("open_threats") or [])[:10]:
            tid = threat.get("id")
            if not tid:
                continue
            entities.append({"type": "threat", "id": tid, "title": threat.get("title")})
            citations.append(
                make_citation(
                    id=str(tid),
                    type="threat",
                    label=threat.get("title") or str(tid),
                    url_path=_threat_url(str(tid)),
                )
            )

        try:
            open_query = merge_tenant_filter(
                {
                    "status": {"$nin": ["Closed", "closed", "Mitigated", "mitigated"]},
                    "$or": [
                        {"linked_equipment_id": equipment_id},
                        {"equipment_id": equipment_id},
                    ],
                },
                user,
            )
            threat_docs = await conn.threats.find(
                open_query,
                {
                    "_id": 0,
                    "id": 1,
                    "title": 1,
                    "status": 1,
                    "risk_score": 1,
                    "risk_level": 1,
                },
            ).sort("risk_score", -1).limit(10).to_list(10)
            open_signals = [project_list_item(doc) for doc in threat_docs]
        except Exception as exc:
            logger.warning("evidence pack open signals query failed: %s", exc)

        if open_signals:
            kpis["open_work_signals"] = len(open_signals)

    prompt_parts: List[str] = []
    if kpis.get("fleet"):
        fleet = kpis["fleet"]
        prompt_parts.append(
            "Fleet KPIs: "
            f"open_signals={fleet.get('unified_open_signals')}, "
            f"high_risk={fleet.get('high_risk_threats')}, "
            f"overdue_pm={fleet.get('overdue_pm', {}).get('total')}"
        )
    if equipment_id and ctx.get("found"):
        prompt_parts.append(format_context_for_prompt(ctx))
    if kpis.get("equipment"):
        eq_kpi = kpis["equipment"]
        prompt_parts.append(
            "Canonical equipment state: "
            f"health={eq_kpi.get('health_score')}, "
            f"risk={eq_kpi.get('risk_level')}, "
            f"open_obs={eq_kpi.get('open_observation_count')}, "
            f"exposure={eq_kpi.get('exposure_score')}"
        )
    if graph_edges:
        prompt_parts.append("Graph risk paths (cite edge_id as [cite:<edge_id>]):")
        for edge in graph_edges[:12]:
            prompt_parts.append(
                f"  - {edge.get('edge_id')}: {edge.get('source')} "
                f"-[{edge.get('relation')}]-> {edge.get('target')}"
            )
    if open_signals:
        prompt_parts.append(f"Open work signals ({len(open_signals)}):")
        for sig in open_signals[:8]:
            prompt_parts.append(
                f"  - [{sig.get('id')}] {sig.get('title')} "
                f"risk={sig.get('risk_level')} status={sig.get('status')}"
            )

    return {
        "intent": intent,
        "equipment_id": equipment_id,
        "entities": entities,
        "kpis": kpis,
        "graph_edges": graph_edges,
        "open_signals": open_signals,
        "citations": _dedupe_citations(citations),
        "prompt_summary": "\n".join(prompt_parts) if prompt_parts else "No evidence available.",
    }


def _dedupe_citations(citations: List[Dict[str, str]]) -> List[Dict[str, str]]:
    seen: set[str] = set()
    out: List[Dict[str, str]] = []
    for cite in citations:
        key = f"{cite.get('type')}:{cite.get('id')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(cite)
    return out
