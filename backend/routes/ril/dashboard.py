"""
RIL Dashboard API — orchestration only (Wave 8 convergence).
"""
from datetime import datetime

from fastapi import APIRouter, Depends

from routes.ril._auth import _ril_read

router = APIRouter(prefix="/dashboard", tags=["RIL Dashboard"])


@router.get("/stats", response_model=dict)
async def get_dashboard_stats(current_user: dict = Depends(_ril_read)):
    """Get main RIL dashboard statistics."""
    from services import ril_dashboard_service

    owner_id = current_user.get("owner_id") or current_user.get("id")
    return await ril_dashboard_service.get_dashboard_stats(current_user, owner_id)


@router.get("/executive", response_model=dict)
async def get_executive_dashboard(current_user: dict = Depends(_ril_read)):
    """Get executive-level KPIs with evidence-backed calculations."""
    from services import ril_dashboard_service

    owner_id = current_user.get("owner_id") or current_user.get("id")
    payload = await ril_dashboard_service.get_executive_dashboard(current_user, owner_id)
    return payload


@router.get("/supervisor", response_model=dict)
async def get_supervisor_dashboard(current_user: dict = Depends(_ril_read)):
    """Supervisor Command Center — operational queue composed from existing services."""
    from services.supervisor_dashboard_service import get_supervisor_dashboard as build_supervisor

    return await build_supervisor(current_user)


@router.get("/intelligence", response_model=dict)
async def get_intelligence_dashboard(current_user: dict = Depends(_ril_read)):
    """Get intelligence dashboard data."""
    from services import ril_dashboard_service

    owner_id = current_user.get("owner_id") or current_user.get("id")
    return await ril_dashboard_service.get_intelligence_dashboard(current_user, owner_id)


@router.get("/data-quality", response_model=dict)
async def get_data_quality_dashboard(current_user: dict = Depends(_ril_read)):
    """Get data quality statistics."""
    from services import ril_dashboard_service

    owner_id = current_user.get("owner_id") or current_user.get("id")
    return await ril_dashboard_service.get_data_quality_dashboard(current_user, owner_id)


@router.get("/equipment/{equipment_id}/reliability-edges")
async def get_equipment_reliability_edges(
    equipment_id: str,
    limit: int = 200,
    current_user: dict = Depends(_ril_read),
):
    """Traversable reliability graph edges for an equipment item."""
    from services.reliability_graph import get_edges_for_equipment
    from services.tenant_schema import tenant_id_from_user

    edges = await get_edges_for_equipment(
        equipment_id, limit=limit, tenant_id=tenant_id_from_user(current_user)
    )
    return {"equipment_id": equipment_id, "edges": edges, "total": len(edges)}


@router.get("/equipment/{equipment_id}/reliability-profile")
async def get_equipment_reliability_profile(
    equipment_id: str,
    refresh: bool = False,
    current_user: dict = Depends(_ril_read),
):
    """Composed asset reliability profile — single source of truth for one equipment item."""
    from services.equipment_reliability_profile_service import build_equipment_reliability_profile
    from services.ril_service_factory import ril_owner_id

    profile = await build_equipment_reliability_profile(
        equipment_id,
        ril_owner_id(current_user),
        user=current_user,
        refresh_context=refresh,
    )
    return {"success": True, "profile": profile}


@router.get("/equipment/{equipment_id}/reliability-chain")
async def get_equipment_reliability_chain(
    equipment_id: str,
    depth: int = 5,
    limit: int = 200,
    current_user: dict = Depends(_ril_read),
):
    """Graph-backed reliability chain paths for an equipment item."""
    from services.reliability_graph_query import GraphTraversalService

    traversal = GraphTraversalService()
    chain = await traversal.get_chain(
        equipment_id, depth=depth, user=current_user, edge_limit=limit
    )
    risk = await traversal.explain_risk(equipment_id, user=current_user)
    return {
        "equipment_id": equipment_id,
        "chain": chain,
        "risk_explanation": risk,
    }


@router.get("/nodes/{node_type}/{node_id}/reliability-trace")
async def get_node_reliability_trace(
    node_type: str,
    node_id: str,
    depth: int = 8,
    current_user: dict = Depends(_ril_read),
):
    """Upstream/downstream graph evidence for a single node (evidence panels)."""
    from services.reliability_graph_query import GraphTraversalService

    traversal = GraphTraversalService()
    upstream = await traversal.get_upstream(
        node_type, node_id, depth=depth, user=current_user
    )
    downstream = await traversal.get_downstream(
        node_type, node_id, depth=depth, user=current_user
    )
    edges = upstream.get("edges", []) + downstream.get("edges", [])
    seen: set[str] = set()
    merged: list = []
    for edge in edges:
        eid = edge.get("id")
        if eid and eid in seen:
            continue
        if eid:
            seen.add(eid)
        merged.append(edge)

    equipment_id = None
    for edge in merged:
        for key, ntype in (
            (edge.get("source_id"), edge.get("source_type")),
            (edge.get("target_id"), edge.get("target_type")),
        ):
            if ntype == "equipment" and key:
                equipment_id = key
                break
        if equipment_id:
            break

    risk = None
    if equipment_id:
        risk = await traversal.explain_risk(equipment_id, user=current_user)

    return {
        "node_type": node_type,
        "node_id": node_id,
        "equipment_id": equipment_id,
        "upstream": upstream,
        "downstream": downstream,
        "edges": merged,
        "edge_count": len(merged),
        "risk_explanation": risk,
    }


@router.get("/reliability-graph/ontology")
async def get_reliability_graph_ontology(current_user: dict = Depends(_ril_read)):
    """Reliability knowledge graph ontology schema and live edge counts."""
    from services.reliability_ontology import get_reliability_ontology_payload

    payload = await get_reliability_ontology_payload(current_user)
    return {
        **payload,
        "generated_at": datetime.utcnow().isoformat(),
    }
