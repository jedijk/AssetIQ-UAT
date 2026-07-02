"""Success Readiness orchestration service."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db

from services.success_readiness_assessments import list_assessments, submit_assessment
from services.success_readiness_collector import (
    _apply_trends,
    _previous_scores,
    collect_measurements,
)
from services.success_readiness_kpi_engine import (
    build_kpi_results,
    overall_score,
    pillar_score,
)
from services.success_readiness_kpi_actions import (
    owner_role_for_kpi,
    primary_action_for_kpi,
)
from services.success_readiness_models import PILLAR_WEIGHTS, kpi_by_id
from services.success_readiness_registers import (
    create_register_entry,
    list_register_entries,
    update_register_entry,
)
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, with_tenant_id


async def get_dashboard(user: dict) -> Dict[str, Any]:
    tenant_id = tenant_id_from_user(user)
    kpis = await build_kpi_results(user, tenant_id)
    previous = await _previous_scores(user, [k["id"] for k in kpis])
    kpis = _apply_trends(kpis, previous)
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


async def collect_and_persist(user: dict) -> Dict[str, Any]:
    return await collect_measurements(user, record_history=True)


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
    if not match:
        return None
    evidence = await list_evidence(user, kpi_id=kpi_id)
    match = dict(match)
    match["evidence"] = evidence
    return match


async def get_registers(user: dict, register_type: str) -> List[Dict[str, Any]]:
    return await list_register_entries(register_type, user)


async def create_register(user: dict, register_type: str, payload: dict) -> Dict[str, Any]:
    return await create_register_entry(register_type, payload, user)


async def update_register(user: dict, entry_id: str, payload: dict) -> Optional[Dict[str, Any]]:
    return await update_register_entry(entry_id, payload, user)


async def list_evidence(user: dict, kpi_id: Optional[str] = None) -> List[Dict[str, Any]]:
    base: Dict[str, Any] = {"kpi_id": kpi_id} if kpi_id else {}
    query = merge_tenant_filter(base, user)
    cursor = db.success_readiness_evidence.find(query).sort("created_at", -1).limit(100)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        rows.append(doc)
    return rows


async def create_evidence(user: dict, payload: dict) -> Dict[str, Any]:
    doc = {
        "kpi_id": payload.get("kpi_id"),
        "title": payload.get("title") or "Evidence",
        "description": payload.get("description") or "",
        "source": payload.get("source") or "manual",
        "attachment_url": payload.get("attachment_url"),
        "created_at": _iso_now(),
        "updated_at": _iso_now(),
        "created_by": user.get("id") or user.get("user_id"),
    }
    with_tenant_id(doc, user)
    result = await db.success_readiness_evidence.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return doc


async def list_history(user: dict, limit: int = 50) -> List[Dict[str, Any]]:
    query = merge_tenant_filter({}, user)
    cursor = db.success_readiness_history.find(query).sort("recorded_at", -1).limit(limit)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        rows.append(doc)
    return rows


async def get_ai_recommendations(user: dict) -> Dict[str, Any]:
    dashboard = await get_dashboard(user)
    kpis = sorted(
        [k for k in dashboard.get("kpis", []) if k.get("score") is not None],
        key=lambda k: k.get("score", 100),
    )
    recommendations = []
    for kpi in kpis[:5]:
        gap = (kpi.get("target") or 0) - (kpi.get("score") or 0)
        recommendations.append({
            "kpi_id": kpi["id"],
            "pillar": kpi["pillar"],
            "title": f"Improve {kpi['name']}",
            "priority": "high" if gap > 25 else "medium" if gap > 10 else "low",
            "rationale": f"Current score {kpi.get('score')}% vs target {kpi.get('target')}%",
            "estimated_impact": min(15, max(2, gap // 2)),
            "evidence": kpi.get("auto_detail") or {},
            "recommended_action": primary_action_for_kpi(kpi["id"]),
            "responsible_role": owner_role_for_kpi(kpi["id"], kpi.get("pillar")),
        })
    return {
        "recommendations": recommendations,
        "ai_enabled": False,
    }


async def get_configuration(user: dict) -> Dict[str, Any]:
    query = merge_tenant_filter({"type": "success_readiness_config"}, user)
    doc = await db.success_readiness_config.find_one(query)
    if doc:
        doc["id"] = str(doc.pop("_id"))
        doc.setdefault("integrations_enabled", True)
        return doc
    return {
        "targets_locked": False,
        "pillar_weights": PILLAR_WEIGHTS,
        "notification_enabled": True,
        "integrations_enabled": True,
    }


async def update_configuration(user: dict, payload: dict) -> Dict[str, Any]:
    current = await get_configuration(user)
    doc = {
        "type": "success_readiness_config",
        "targets_locked": payload.get("targets_locked", current.get("targets_locked", False)),
        "notification_enabled": payload.get(
            "notification_enabled", current.get("notification_enabled", True)
        ),
        "integrations_enabled": payload.get(
            "integrations_enabled", current.get("integrations_enabled", True)
        ),
        "updated_at": _iso_now(),
    }
    if "pillar_weights" in payload:
        doc["pillar_weights"] = payload["pillar_weights"]
    elif current.get("pillar_weights"):
        doc["pillar_weights"] = current["pillar_weights"]
    with_tenant_id(doc, user)
    query = merge_tenant_filter({"type": "success_readiness_config"}, user)
    await db.success_readiness_config.update_one(query, {"$set": doc}, upsert=True)
    return await get_configuration(user)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()
