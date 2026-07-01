"""Success Readiness orchestration service."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db

from services.success_readiness_kpi_engine import (
    build_kpi_results,
    overall_score,
    pillar_score,
)
from services.success_readiness_models import PILLAR_WEIGHTS, kpi_by_id
from services.success_readiness_registers import (
    create_register_entry,
    list_register_entries,
    update_register_entry,
)
from services.tenant_schema import tenant_id_from_user


async def get_dashboard(user: dict) -> Dict[str, Any]:
    tenant_id = tenant_id_from_user(user)
    kpis = await build_kpi_results(user, tenant_id)
    pillars = {
        pillar: {
            "weight": weight,
            "score": pillar_score(kpis, pillar),
        }
        for pillar, weight in PILLAR_WEIGHTS.items()
    }
    return {
        "overall_score": overall_score(kpis),
        "pillars": pillars,
        "kpi_summary": {
            "total": len(kpis),
            "on_track": sum(1 for k in kpis if k.get("status") == "on_track"),
            "at_risk": sum(1 for k in kpis if k.get("status") == "at_risk"),
            "off_track": sum(1 for k in kpis if k.get("status") == "off_track"),
            "not_started": sum(1 for k in kpis if k.get("status") == "not_started"),
        },
        "kpis": kpis,
        "generated_at": _iso_now(),
    }


async def get_kpis(user: dict, pillar: Optional[str] = None) -> List[Dict[str, Any]]:
    tenant_id = tenant_id_from_user(user)
    kpis = await build_kpi_results(user, tenant_id)
    if pillar:
        kpis = [k for k in kpis if k.get("pillar") == pillar]
    return kpis


async def get_kpi_detail(user: dict, kpi_id: str) -> Optional[Dict[str, Any]]:
    spec = kpi_by_id(kpi_id)
    if not spec:
        return None
    tenant_id = tenant_id_from_user(user)
    kpis = await build_kpi_results(user, tenant_id)
    match = next((k for k in kpis if k.get("id") == kpi_id), None)
    return match


async def get_registers(user: dict, register_type: str) -> List[Dict[str, Any]]:
    tenant_id = tenant_id_from_user(user)
    return await list_register_entries(register_type, tenant_id)


async def create_register(user: dict, register_type: str, payload: dict) -> Dict[str, Any]:
    return await create_register_entry(register_type, payload, user)


async def update_register(user: dict, entry_id: str, payload: dict) -> Optional[Dict[str, Any]]:
    return await update_register_entry(entry_id, payload, user)


async def list_assessments(user: dict) -> List[Dict[str, Any]]:
    """Manual assessment templates — stub list for foundation."""
    tenant_id = tenant_id_from_user(user)
    query = {"tenant_id": tenant_id} if tenant_id else {}
    cursor = db.success_readiness_assessments.find(query).sort("updated_at", -1).limit(50)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        rows.append(doc)
    if rows:
        return rows
    return _default_assessment_stubs()


async def list_evidence(user: dict, kpi_id: Optional[str] = None) -> List[Dict[str, Any]]:
    tenant_id = tenant_id_from_user(user)
    query: Dict[str, Any] = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if kpi_id:
        query["kpi_id"] = kpi_id
    cursor = db.success_readiness_evidence.find(query).sort("created_at", -1).limit(100)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        rows.append(doc)
    return rows


async def list_history(user: dict, limit: int = 50) -> List[Dict[str, Any]]:
    tenant_id = tenant_id_from_user(user)
    query = {"tenant_id": tenant_id} if tenant_id else {}
    cursor = db.success_readiness_history.find(query).sort("recorded_at", -1).limit(limit)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        rows.append(doc)
    return rows


async def get_ai_recommendations(user: dict) -> Dict[str, Any]:
    """Stub — returns prioritized actions from lowest-scoring KPIs."""
    dashboard = await get_dashboard(user)
    kpis = sorted(
        [k for k in dashboard.get("kpis", []) if k.get("score") is not None],
        key=lambda k: k.get("score", 100),
    )
    recommendations = []
    for kpi in kpis[:5]:
        recommendations.append({
            "kpi_id": kpi["id"],
            "pillar": kpi["pillar"],
            "title": f"Improve {kpi['name']}",
            "priority": "high" if (kpi.get("score") or 0) < 60 else "medium",
            "rationale": f"Current score {kpi.get('score')}% vs target {kpi.get('target')}%",
            "status": "stub",
        })
    return {
        "recommendations": recommendations,
        "ai_enabled": False,
        "todo": "TODO: wire AI coach for personalized recommendations",
    }


async def get_configuration(user: dict) -> Dict[str, Any]:
    tenant_id = tenant_id_from_user(user)
    query = {"type": "success_readiness_config"}
    if tenant_id:
        query["tenant_id"] = tenant_id
    doc = await db.success_readiness_config.find_one(query)
    if doc:
        doc["id"] = str(doc.pop("_id"))
        return doc
    return {
        "targets_locked": False,
        "pillar_weights": PILLAR_WEIGHTS,
        "notification_enabled": True,
        "todo": "TODO: persist configuration per tenant",
    }


async def update_configuration(user: dict, payload: dict) -> Dict[str, Any]:
    from services.tenant_schema import with_tenant_id

    tenant_id = tenant_id_from_user(user)
    doc = {
        "type": "success_readiness_config",
        "targets_locked": payload.get("targets_locked", False),
        "notification_enabled": payload.get("notification_enabled", True),
        "updated_at": _iso_now(),
    }
    if "pillar_weights" in payload:
        doc["pillar_weights"] = payload["pillar_weights"]
    with_tenant_id(doc, user)
    query = {"type": "success_readiness_config"}
    if tenant_id:
        query["tenant_id"] = tenant_id
    await db.success_readiness_config.update_one(query, {"$set": doc}, upsert=True)
    return await get_configuration(user)


def _default_assessment_stubs() -> List[Dict[str, Any]]:
    return [
        {
            "id": "stub-training",
            "title": "Training readiness assessment",
            "status": "not_started",
            "kpi_ids": ["training_completion"],
            "todo": "TODO: implement assessment workflow",
        },
        {
            "id": "stub-governance",
            "title": "Governance maturity assessment",
            "status": "not_started",
            "kpi_ids": ["governance_maturity"],
            "todo": "TODO: implement assessment workflow",
        },
        {
            "id": "stub-infrastructure",
            "title": "Infrastructure readiness assessment",
            "status": "not_started",
            "kpi_ids": ["infrastructure_readiness"],
            "todo": "TODO: implement assessment workflow",
        },
    ]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()
