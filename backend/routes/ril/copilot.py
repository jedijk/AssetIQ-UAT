"""RIL Copilot API."""
from fastapi import APIRouter, Depends

from models.ril import CopilotQueryRequest
from routes.ril._auth import _ril_read, _ril_write
from services.ril_service_factory import get_copilot_services, ril_owner_id

router = APIRouter(prefix="/copilot", tags=["RIL Copilot"])


@router.post("/query", response_model=dict)
async def query_copilot(
    request: CopilotQueryRequest,
    current_user: dict = Depends(_ril_write),
):
    _, copilot_service = get_copilot_services(current_user)
    return await copilot_service.process_query(
        ril_owner_id(current_user),
        request,
        current_user=current_user,
    )


@router.get("/context/{equipment_id}", response_model=dict)
async def get_equipment_reliability_context(
    equipment_id: str,
    refresh: bool = False,
    current_user: dict = Depends(_ril_read),
):
    from services.reliability_context_service import ReliabilityContextService

    ctx = await ReliabilityContextService().get_context(
        equipment_id,
        ril_owner_id(current_user),
        user=current_user,
        use_cache=not refresh,
    )
    return {"success": True, "context": ctx}


@router.get("/suggestions", response_model=dict)
async def get_query_suggestions(
    current_user: dict = Depends(_ril_read),
):
    ril_service, _ = get_copilot_services(current_user)
    owner_id = ril_owner_id(current_user)
    stats = await ril_service.get_dashboard_stats(owner_id)

    suggestions = [
        {"query": "What needs my attention today?", "category": "priority"},
        {"query": "Show open reliability cases", "category": "cases"},
        {"query": "What changed this week?", "category": "changes"},
    ]

    if stats.get("p1_cases", 0) > 0:
        suggestions.append({
            "query": f"Why do we have {stats['p1_cases']} P1 cases?",
            "category": "risk",
        })

    if stats.get("alerts_7d", 0) > 10:
        suggestions.append({
            "query": "What's causing the high number of alerts?",
            "category": "alerts",
        })

    if stats.get("pending_recommendations", 0) > 0:
        suggestions.append({
            "query": f"Show {stats['pending_recommendations']} pending strategy recommendations",
            "category": "recommendations",
        })

    suggestions.extend([
        {"query": "Which equipment is at highest risk?", "category": "predictions"},
        {"query": "Show fleet comparison for pumps", "category": "fleet"},
        {"query": "What failures are predicted this month?", "category": "predictions"},
    ])

    return {"suggestions": suggestions[:10], "context": stats}
