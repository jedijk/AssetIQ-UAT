"""
AI Risk Engine — Wave 13 tenant-scoped service.

Thin facade re-exporting split modules for route compatibility.
"""
from services.ai_risk_analysis import (
    analyze_threat_risk,
    chat_analyze,
    explain_threat,
    generate_bow_tie,
    generate_fault_tree,
    generate_threat_causes,
    get_action_optimization,
    get_ai_top_risks,
    get_bow_tie,
    get_causal_analysis,
    get_fault_tree,
    get_risk_insights,
    optimize_threat_actions,
)
from services.ai_risk_dashboard import (
    DashboardIntentRequest,
    check_injection_attempt,
    dashboard_intent,
    log_ai_usage,
)

__all__ = [
    "DashboardIntentRequest",
    "analyze_threat_risk",
    "chat_analyze",
    "check_injection_attempt",
    "dashboard_intent",
    "explain_threat",
    "generate_bow_tie",
    "generate_fault_tree",
    "generate_threat_causes",
    "get_action_optimization",
    "get_ai_top_risks",
    "get_bow_tie",
    "get_causal_analysis",
    "get_fault_tree",
    "get_risk_insights",
    "log_ai_usage",
    "optimize_threat_actions",
]
