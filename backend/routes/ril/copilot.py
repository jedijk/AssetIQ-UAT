"""
RIL Copilot API
Reliability Copilot - Natural language interface for reliability intelligence.

Example Questions:
- Why is P-104 high risk?
- What changed this week?
- Show all evidence for HX-201.
- Which assets need attention today?
- What failures are predicted this month?
"""

from fastapi import APIRouter, Depends
from auth import get_current_user
from services.ril_service import RILService
from services.ril_copilot_service import ReliabilityCopilotService
from models.ril import CopilotQueryRequest

router = APIRouter(prefix="/copilot", tags=["RIL Copilot"])


def get_services():
    """Get RIL service instances"""
    from database import db
    ril_service = RILService(db)
    copilot_service = ReliabilityCopilotService(db, ril_service)
    return ril_service, copilot_service


@router.post("/query", response_model=dict)
async def query_copilot(
    request: CopilotQueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Ask the Reliability Copilot a question in natural language.
    
    The copilot can help with:
    - Risk analysis ("Why is P-104 high risk?")
    - Change tracking ("What changed this week?")
    - Evidence review ("Show all evidence for HX-201")
    - Priority management ("Which assets need attention today?")
    - Failure prediction ("What failures are predicted this month?")
    - Case status ("Show open reliability cases")
    - Alert summary ("What alerts came in today?")
    
    Returns:
    - answer: Natural language response
    - data: Supporting data
    - actions: Suggested follow-up actions
    - visualization_type: Suggested visualization
    """
    _, copilot_service = get_services()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    response = await copilot_service.process_query(owner_id, request, current_user=current_user)
    
    return response


@router.get("/suggestions", response_model=dict)
async def get_query_suggestions(
    current_user: dict = Depends(get_current_user)
):
    """
    Get suggested queries based on current context.
    
    Returns common questions and context-aware suggestions.
    """
    ril_service, _ = get_services()
    owner_id = current_user.get("owner_id") or current_user.get("id")
    
    # Get context
    stats = await ril_service.get_dashboard_stats(owner_id)
    
    suggestions = [
        # Always available
        {"query": "What needs my attention today?", "category": "priority"},
        {"query": "Show open reliability cases", "category": "cases"},
        {"query": "What changed this week?", "category": "changes"},
    ]
    
    # Context-aware suggestions
    if stats.get("p1_cases", 0) > 0:
        suggestions.append({
            "query": f"Why do we have {stats['p1_cases']} P1 cases?",
            "category": "risk"
        })
    
    if stats.get("alerts_7d", 0) > 10:
        suggestions.append({
            "query": "What's causing the high number of alerts?",
            "category": "alerts"
        })
    
    if stats.get("pending_recommendations", 0) > 0:
        suggestions.append({
            "query": f"Show {stats['pending_recommendations']} pending strategy recommendations",
            "category": "recommendations"
        })
    
    # Add more generic suggestions
    suggestions.extend([
        {"query": "Which equipment is at highest risk?", "category": "predictions"},
        {"query": "Show fleet comparison for pumps", "category": "fleet"},
        {"query": "What failures are predicted this month?", "category": "predictions"},
    ])
    
    return {
        "suggestions": suggestions[:10],  # Limit to 10
        "context": stats
    }
