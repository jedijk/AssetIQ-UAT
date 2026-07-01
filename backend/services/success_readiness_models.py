"""Success Readiness domain models and KPI catalog."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict

PillarId = Literal["people", "process", "technology"]
RegisterType = Literal["training", "champion", "procedure", "governance"]
KpiStatus = Literal["on_track", "at_risk", "off_track", "not_started"]
KpiSource = Literal["automatic", "manual", "stub"]

PILLAR_WEIGHTS: Dict[PillarId, float] = {
    "people": 0.33,
    "process": 0.33,
    "technology": 0.34,
}

KPI_CATALOG: List[Dict[str, Any]] = [
    # People — 5 KPIs @ 20% each within pillar
    {
        "id": "user_adoption",
        "pillar": "people",
        "name": "User Adoption",
        "weight": 0.20,
        "target": 80,
        "source": "automatic",
        "description": "Share of licensed users active in the last 30 days",
    },
    {
        "id": "training_completion",
        "pillar": "people",
        "name": "Training Completion",
        "weight": 0.20,
        "target": 90,
        "source": "manual",
        "description": "Completed training records vs required curriculum",
    },
    {
        "id": "champion_program",
        "pillar": "people",
        "name": "Champion Program",
        "weight": 0.20,
        "target": 75,
        "source": "manual",
        "description": "Named champions per site/area with active engagement",
    },
    {
        "id": "role_coverage",
        "pillar": "people",
        "name": "Role Coverage",
        "weight": 0.20,
        "target": 80,
        "source": "stub",
        "description": "Critical roles staffed and permissioned",
    },
    {
        "id": "change_readiness",
        "pillar": "people",
        "name": "Change Readiness",
        "weight": 0.20,
        "target": 70,
        "source": "stub",
        "description": "Stakeholder readiness for rollout milestones",
    },
    # Process
    {
        "id": "core_data_readiness",
        "pillar": "process",
        "name": "Core Data Readiness",
        "weight": 0.20,
        "target": 85,
        "source": "automatic",
        "description": "Hierarchy, equipment typing, and criticality coverage",
    },
    {
        "id": "procedure_coverage",
        "pillar": "process",
        "name": "Procedure Coverage",
        "weight": 0.20,
        "target": 80,
        "source": "manual",
        "description": "Documented procedures for critical workflows",
    },
    {
        "id": "governance_maturity",
        "pillar": "process",
        "name": "Governance Maturity",
        "weight": 0.20,
        "target": 75,
        "source": "manual",
        "description": "Governance cadence, RACI, and escalation paths",
    },
    {
        "id": "workflow_adoption",
        "pillar": "process",
        "name": "Workflow Adoption",
        "weight": 0.20,
        "target": 70,
        "source": "stub",
        "description": "Observations, actions, and tasks used as designed",
    },
    {
        "id": "reliability_process",
        "pillar": "process",
        "name": "Reliability Process",
        "weight": 0.20,
        "target": 75,
        "source": "stub",
        "description": "RCM / FMEA / strategy coverage on critical assets",
    },
    # Technology
    {
        "id": "platform_utilization",
        "pillar": "technology",
        "name": "Platform Utilization",
        "weight": 0.20,
        "target": 65,
        "source": "stub",
        "description": "Breadth of modules used across the tenant",
    },
    {
        "id": "integration_health",
        "pillar": "technology",
        "name": "Integration Health",
        "weight": 0.20,
        "target": 80,
        "source": "stub",
        "description": "External API, imports, and connector status",
    },
    {
        "id": "data_quality",
        "pillar": "technology",
        "name": "Data Quality",
        "weight": 0.20,
        "target": 80,
        "source": "stub",
        "description": "Duplicates, orphans, and validation failures",
    },
    {
        "id": "infrastructure_readiness",
        "pillar": "technology",
        "name": "Infrastructure Readiness",
        "weight": 0.20,
        "target": 85,
        "source": "manual",
        "description": "SSO, mobile, kiosk, and environment configuration",
    },
    {
        "id": "ai_readiness",
        "pillar": "technology",
        "name": "AI Readiness",
        "weight": 0.20,
        "target": 60,
        "source": "stub",
        "description": "AI features enabled with acceptable usage guardrails",
    },
]

REGISTER_TYPES: List[RegisterType] = ["training", "champion", "procedure", "governance"]


class KpiResult(TypedDict, total=False):
    id: str
    pillar: PillarId
    name: str
    weight: float
    target: int
    score: Optional[int]
    trend: Optional[int]
    status: KpiStatus
    source: KpiSource
    description: str
    evidence_count: int
    auto_detail: Optional[Dict[str, Any]]
    todo: Optional[str]


def status_from_score(score: Optional[int], target: int) -> KpiStatus:
    if score is None:
        return "not_started"
    if score >= target:
        return "on_track"
    if score >= max(target - 20, 50):
        return "at_risk"
    return "off_track"


def kpi_by_id(kpi_id: str) -> Optional[Dict[str, Any]]:
    for row in KPI_CATALOG:
        if row["id"] == kpi_id:
            return row
    return None
