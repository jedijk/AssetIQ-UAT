"""Improvement actions per Success Readiness KPI."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

KPI_IMPROVEMENT_ACTIONS: Dict[str, List[Dict[str, Any]]] = {
    "user_adoption": [
        {
            "label": "Collect latest measurements",
            "description": "Refresh adoption metrics from live user activity.",
            "path": "/settings/success-readiness",
        },
        {
            "label": "Identify inactive users",
            "description": "Review users who have not logged in during the last 30 days and follow up.",
            "path": "/settings/users",
        },
        {
            "label": "Run a pulse survey",
            "description": "Send a short adoption survey to inactive or new users.",
            "path": "/settings/success-readiness/pulse-surveys/new",
        },
    ],
    "training_completion": [
        {
            "label": "Update training register",
            "description": "Record completed training and expiry dates for each user.",
            "path": "/settings/success-readiness/registers",
        },
        {
            "label": "Schedule refresher training",
            "description": "Assign outstanding curriculum to users below target completion.",
        },
        {
            "label": "Attach training evidence",
            "description": "Upload certificates or completion records as KPI evidence.",
            "path": "/settings/success-readiness/evidence",
        },
    ],
    "champion_program": [
        {
            "label": "Assign department champions",
            "description": "Name a primary and backup champion for each area in the register.",
            "path": "/settings/success-readiness/registers",
        },
        {
            "label": "Activate champion cadence",
            "description": "Set a monthly check-in for champions to support local adoption.",
        },
    ],
    "role_coverage": [
        {
            "label": "Review user roles",
            "description": "Ensure critical roles (operators, supervisors, engineers) are assigned.",
            "path": "/settings/users",
        },
        {
            "label": "Collect measurements",
            "description": "Recalculate role coverage from current permissions.",
            "path": "/settings/success-readiness",
        },
    ],
    "change_readiness": [
        {
            "label": "Complete change readiness assessment",
            "description": "Score stakeholder readiness for upcoming rollout milestones.",
            "path": "/settings/success-readiness/assessments",
        },
        {
            "label": "Publish a pulse survey",
            "description": "Gather feedback on change acceptance and support awareness.",
            "path": "/settings/success-readiness/pulse-surveys/new",
        },
    ],
    "core_data_readiness": [
        {
            "label": "Complete equipment hierarchy",
            "description": "Ensure sites, units, and maintainable items are fully modeled.",
            "path": "/dashboard",
        },
        {
            "label": "Assign equipment types",
            "description": "Type operational equipment nodes for reliability workflows.",
        },
        {
            "label": "Set criticality levels",
            "description": "Assign criticality on key assets to prioritize reliability work.",
        },
    ],
    "procedure_coverage": [
        {
            "label": "Update procedure register",
            "description": "Mark SOPs as updated for AssetIQ and set review dates.",
            "path": "/settings/success-readiness/registers",
        },
        {
            "label": "Link procedures to workflows",
            "description": "Reference AssetIQ steps in daily operating procedures.",
        },
    ],
    "governance_maturity": [
        {
            "label": "Complete governance register",
            "description": "Document meeting cadence, owners, and escalation paths.",
            "path": "/settings/success-readiness/registers",
        },
        {
            "label": "Run governance assessment",
            "description": "Score RACI clarity and escalation effectiveness.",
            "path": "/settings/success-readiness/assessments",
        },
    ],
    "workflow_adoption": [
        {
            "label": "Close observation loops",
            "description": "Ensure observations progress to actions and verified completion.",
            "path": "/observations",
        },
        {
            "label": "Promote task usage",
            "description": "Drive daily work through My Tasks instead of offline tracking.",
            "path": "/my-tasks",
        },
    ],
    "reliability_process": [
        {
            "label": "Review critical asset coverage",
            "description": "Confirm RCM, FMEA, or strategy coverage on critical equipment.",
            "path": "/reliability",
        },
        {
            "label": "Collect measurements",
            "description": "Refresh reliability process metrics from live data.",
            "path": "/settings/success-readiness",
        },
    ],
    "platform_utilization": [
        {
            "label": "Enable underused modules",
            "description": "Turn on modules that support your rollout scope but show low usage.",
            "path": "/settings",
        },
        {
            "label": "Run platform feedback survey",
            "description": "Use the default AssetIQ Platform Feedback pulse template.",
            "path": "/settings/success-readiness/pulse-surveys/new",
        },
    ],
    "integration_health": [
        {
            "label": "Review integration settings",
            "description": "Check external API, imports, and connector configuration.",
            "path": "/settings/integrations",
        },
        {
            "label": "Resolve failed imports",
            "description": "Clear import errors and re-run data sync jobs.",
        },
    ],
    "data_quality": [
        {
            "label": "Resolve duplicate records",
            "description": "Merge or remove duplicate equipment and user records.",
        },
        {
            "label": "Fix orphan nodes",
            "description": "Re-parent hierarchy nodes missing valid parent links.",
            "path": "/dashboard",
        },
    ],
    "infrastructure_readiness": [
        {
            "label": "Complete infrastructure review",
            "description": "Assess SSO, mobile, kiosk, and environment readiness.",
            "path": "/settings/success-readiness/assessments",
        },
        {
            "label": "Verify mobile access",
            "description": "Confirm Wi-Fi, device policy, and mobile login for field users.",
        },
    ],
    "ai_readiness": [
        {
            "label": "Enable AI features",
            "description": "Turn on approved AI capabilities for pilot user groups.",
            "path": "/settings",
        },
        {
            "label": "Review AI guardrails",
            "description": "Confirm usage policies and training before broad rollout.",
        },
    ],
}

KPI_OWNER_ROLES: Dict[str, str] = {
    "user_adoption": "admin",
    "training_completion": "admin",
    "champion_program": "admin",
    "role_coverage": "admin",
    "change_readiness": "admin",
    "core_data_readiness": "reliability_engineer",
    "procedure_coverage": "reliability_engineer",
    "governance_maturity": "reliability_engineer",
    "workflow_adoption": "reliability_engineer",
    "reliability_process": "reliability_engineer",
    "platform_utilization": "admin",
    "integration_health": "admin",
    "data_quality": "admin",
    "infrastructure_readiness": "admin",
    "ai_readiness": "admin",
}


def improvement_actions_for_kpi(kpi_id: str) -> List[Dict[str, Any]]:
    return list(KPI_IMPROVEMENT_ACTIONS.get(kpi_id, [
        {
            "label": "Review KPI evidence",
            "description": "Inspect supporting evidence and assign an improvement owner.",
            "path": "/settings/success-readiness/evidence",
        },
        {
            "label": "Collect measurements",
            "description": "Refresh scores from the latest tenant data.",
            "path": "/settings/success-readiness",
        },
    ]))


def primary_action_for_kpi(kpi_id: str) -> str:
    actions = improvement_actions_for_kpi(kpi_id)
    return actions[0]["label"] if actions else "Review KPI evidence and assign an improvement owner."


def owner_role_for_kpi(kpi_id: str, pillar: Optional[str] = None) -> str:
    if kpi_id in KPI_OWNER_ROLES:
        return KPI_OWNER_ROLES[kpi_id]
    if pillar == "people":
        return "admin"
    if pillar == "process":
        return "reliability_engineer"
    return "admin"
