"""Measurement collection, history snapshots, and evidence sync."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db

from services.success_readiness_kpi_engine import build_kpi_results, overall_score, pillar_score
from services.success_readiness_models import PILLAR_WEIGHTS
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, with_tenant_id


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _previous_scores(user: dict, kpi_ids: List[str]) -> Dict[str, int]:
    """Latest score per KPI from before the last 25 days (for trend)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=25)).isoformat()
    query = merge_tenant_filter(
        {"kpi_id": {"$in": kpi_ids}, "recorded_at": {"$lte": cutoff}},
        user,
    )
    pipeline = [
        {"$match": query},
        {"$sort": {"recorded_at": -1}},
        {"$group": {"_id": "$kpi_id", "score": {"$first": "$score"}}},
    ]
    rows = await db.success_readiness_history.aggregate(pipeline).to_list(len(kpi_ids))
    return {row["_id"]: row.get("score") for row in rows if row.get("score") is not None}


def _apply_trends(kpis: List[Dict[str, Any]], previous: Dict[str, int]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for kpi in kpis:
        row = dict(kpi)
        kpi_id = row.get("id")
        score = row.get("score")
        prev = previous.get(kpi_id) if kpi_id else None
        if score is not None and prev is not None:
            row["trend"] = score - prev
        else:
            row["trend"] = None
        out.append(row)
    return out


async def record_history_snapshot(user: dict, kpis: List[Dict[str, Any]]) -> int:
    tenant_id = tenant_id_from_user(user)
    recorded_at = _now_iso()
    docs: List[Dict[str, Any]] = []
    for kpi in kpis:
        if kpi.get("score") is None:
            continue
        doc = {
            "kpi_id": kpi["id"],
            "pillar": kpi.get("pillar"),
            "score": kpi.get("score"),
            "target": kpi.get("target"),
            "status": kpi.get("status"),
            "source": kpi.get("source"),
            "recorded_at": recorded_at,
            "event_type": "kpi_snapshot",
            "auto_detail": kpi.get("auto_detail"),
        }
        if tenant_id:
            doc["tenant_id"] = tenant_id
        docs.append(doc)

    overall = overall_score(kpis)
    if overall is not None:
        overall_doc = {
            "kpi_id": "__overall__",
            "score": overall,
            "recorded_at": recorded_at,
            "event_type": "overall_snapshot",
            "pillars": {
                pillar: pillar_score(kpis, pillar) for pillar in PILLAR_WEIGHTS
            },
        }
        if tenant_id:
            overall_doc["tenant_id"] = tenant_id
        docs.append(overall_doc)

    if not docs:
        return 0
    await db.success_readiness_history.insert_many(docs)
    return len(docs)


async def sync_auto_evidence(user: dict, kpis: List[Dict[str, Any]]) -> int:
    """Upsert evidence rows from automatic KPI measurement details."""
    created = 0
    for kpi in kpis:
        if kpi.get("source") != "automatic" or not kpi.get("auto_detail"):
            continue
        detail = kpi["auto_detail"]
        title = f"{kpi.get('name')} measurement"
        description = ", ".join(f"{k}={v}" for k, v in detail.items() if v is not None)
        query = merge_tenant_filter({"kpi_id": kpi["id"], "source": "auto_snapshot"}, user)
        doc = {
            "kpi_id": kpi["id"],
            "title": title,
            "description": description[:2000],
            "detail": detail,
            "source": "auto_snapshot",
            "updated_at": _now_iso(),
        }
        with_tenant_id(doc, user)
        result = await db.success_readiness_evidence.update_one(
            query,
            {"$set": doc, "$setOnInsert": {"created_at": _now_iso()}},
            upsert=True,
        )
        if result.upserted_id is not None or result.modified_count:
            created += 1
    return created


async def collect_measurements(user: dict, *, record_history: bool = True) -> Dict[str, Any]:
    tenant_id = tenant_id_from_user(user)
    kpis = await build_kpi_results(user, tenant_id)
    previous = await _previous_scores(user, [k["id"] for k in kpis])
    kpis = _apply_trends(kpis, previous)

    history_count = 0
    evidence_count = 0
    if record_history:
        history_count = await record_history_snapshot(user, kpis)
        evidence_count = await sync_auto_evidence(user, kpis)

    pillars = {
        pillar: {"weight": weight, "score": pillar_score(kpis, pillar)}
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
        "generated_at": _now_iso(),
        "collection": {
            "history_records": history_count,
            "evidence_synced": evidence_count,
        },
    }
