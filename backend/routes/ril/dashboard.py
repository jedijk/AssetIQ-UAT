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


@router.get("/reliability-graph/ontology")
async def get_reliability_graph_ontology(current_user: dict = Depends(_ril_read)):
    """Reliability knowledge graph ontology schema and live edge counts."""
    from services.reliability_ontology import get_reliability_ontology_payload

    payload = await get_reliability_ontology_payload(current_user)
    return {
        **payload,
        "generated_at": datetime.utcnow().isoformat(),
    }
