"""
Materialize daily reliability snapshots for Digital Twin time-travel.

Each snapshot captures equipment health proxies, open threats, overdue PM,
active failure modes, and a fingerprint of active graph edges at snapshot time.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.reliability_graph import COLLECTION as EDGES_COLLECTION, EDGE_STATUS_RETIRED
from services.tenant_schema import tenant_id_from_user, prepend_tenant_match
from services.tenant_scope import scoped, scoped_job

logger = logging.getLogger(__name__)

COLLECTION = "reliability_snapshots"
EQUIPMENT_LEVELS = ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"]


def _parse_iso8601(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _edge_fingerprint(edge_ids: List[str]) -> str:
    payload = "|".join(sorted(edge_ids))
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


async def _active_failure_mode_ids(equipment_id: str, *, tenant_id: Optional[str] = None) -> List[str]:
    query: Dict[str, Any] = {
        "equipment_id": equipment_id,
        "relation": "has_failure_mode",
        "status": {"$ne": EDGE_STATUS_RETIRED},
    }
    if tenant_id:
        query["$or"] = [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]
    cursor = db[EDGES_COLLECTION].find(
        query,
        {"_id": 0, "target_id": 1},
    )
    rows = await cursor.to_list(100)
    return [r["target_id"] for r in rows if r.get("target_id")]


async def _active_edges_at(
    equipment_id: str,
    at: datetime,
    *,
    tenant_id: Optional[str] = None,
) -> List[dict]:
    at_iso = _to_iso(at)
    query: Dict[str, Any] = {
        "equipment_id": equipment_id,
        "created_at": {"$lte": at_iso},
        "$or": [
            {"retired_at": None},
            {"retired_at": {"$exists": False}},
            {"retired_at": {"$gt": at_iso}},
        ],
    }
    if tenant_id:
        query = {
            "$and": [
                query,
                {"$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]},
            ]
        }
    return await db[EDGES_COLLECTION].find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)


async def _telemetry_summary(equipment_id: str, *, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Best-effort recent reading aggregates from ril_readings."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    base: Dict[str, Any] = {"equipment_id": equipment_id, "timestamp": {"$gte": since}}
    query = scoped_job(base, tenant_id=tenant_id) if tenant_id else base
    cursor = db.ril_readings.find(
        query,
        {"_id": 0, "metric_name": 1, "value": 1, "unit": 1},
    ).sort("timestamp", -1).limit(50)
    rows = await cursor.to_list(50)
    if not rows:
        return None
    summary: Dict[str, Any] = {}
    for row in rows:
        name = row.get("metric_name") or "value"
        if name in summary:
            continue
        summary[name] = row.get("value")
        if row.get("unit"):
            summary[f"{name}_unit"] = row["unit"]
    return summary or None


async def compute_equipment_reliability_snapshot(
    equipment_id: str,
    *,
    snapshot_at: Optional[datetime] = None,
    equipment_doc: Optional[dict] = None,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build one reliability snapshot document for an equipment item."""
    now = snapshot_at or datetime.now(timezone.utc)
    today_iso = now.date().isoformat()

    eq = equipment_doc or await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "equipment_type_id": 1, "tenant_id": 1, "company_id": 1},
    )
    tid = tenant_id or (eq or {}).get("tenant_id") or (eq or {}).get("company_id")

    threat_base: Dict[str, Any] = {
        "linked_equipment_id": equipment_id,
        "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
    }
    threat_scope = scoped_job(threat_base, tenant_id=tid) if tid else threat_base
    open_threat_count = await db.threats.count_documents(threat_scope)

    high_risk_scope = {
        **threat_scope,
        "risk_level": {"$in": ["High", "high", "Critical", "critical"]},
    }
    high_risk_threats = await db.threats.count_documents(high_risk_scope)

    overdue_base = {
        "equipment_id": equipment_id,
        "status": {"$nin": ["completed", "cancelled"]},
        "due_date": {"$lt": today_iso},
    }
    overdue_scheduled = await db.scheduled_tasks.count_documents(
        scoped_job(overdue_base, tenant_id=tid) if tid else overdue_base
    )
    overdue_inst_base = {
        "equipment_id": equipment_id,
        "status": {"$in": ["pending", "overdue", "scheduled"]},
        "due_date": {"$lt": now},
    }
    overdue_instances = await db.task_instances.count_documents(
        scoped_job(overdue_inst_base, tenant_id=tid) if tid else overdue_inst_base
    )
    overdue_pm_count = overdue_scheduled + overdue_instances

    active_failure_modes = await _active_failure_mode_ids(equipment_id, tenant_id=tid)
    edges = await _active_edges_at(equipment_id, now, tenant_id=tid)
    edge_ids = [e["id"] for e in edges if e.get("id")]

    base_score = 85.0
    score = base_score - (high_risk_threats * 5) - min(overdue_pm_count * 2, 20)
    health_score = round(max(0.0, min(100.0, score)), 1)

    telemetry = await _telemetry_summary(equipment_id, tenant_id=tid)

    doc: Dict[str, Any] = {
        "equipment_id": equipment_id,
        "snapshot_at": _to_iso(now),
        "health_score": health_score,
        "open_threat_count": open_threat_count,
        "overdue_pm_count": overdue_pm_count,
        "active_failure_modes": active_failure_modes,
        "edge_fingerprint": _edge_fingerprint(edge_ids),
        "edge_count": len(edge_ids),
    }
    if tid:
        doc["tenant_id"] = tid
    if telemetry:
        doc["telemetry_summary"] = telemetry
    return doc


async def refresh_reliability_snapshots(
    *,
    snapshot_at: Optional[datetime] = None,
    equipment_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Upsert reliability snapshots for all (or selected) equipment."""
    from services.tenant_schema import BACKFILL_TENANT_ID

    snap_at = snapshot_at or datetime.now(timezone.utc)
    snap_iso = _to_iso(snap_at)
    query: Dict[str, Any] = {"level": {"$in": EQUIPMENT_LEVELS}}
    if equipment_ids:
        query["id"] = {"$in": list(equipment_ids)}
    if BACKFILL_TENANT_ID:
        query = scoped_job(query)

    upserted = 0
    async for eq in db.equipment_nodes.find(
        query,
        {"_id": 0, "id": 1, "tenant_id": 1, "company_id": 1, "equipment_type_id": 1},
    ):
        eq_id = eq.get("id")
        if not eq_id:
            continue
        tid = eq.get("tenant_id") or eq.get("company_id")
        doc = await compute_equipment_reliability_snapshot(
            eq_id,
            snapshot_at=snap_at,
            equipment_doc=eq,
            tenant_id=tid,
        )
        filter_doc: Dict[str, Any] = {"equipment_id": eq_id, "snapshot_at": snap_iso}
        if tid:
            filter_doc["tenant_id"] = tid
        await db[COLLECTION].update_one(
            filter_doc,
            {
                "$set": doc,
                "$setOnInsert": {"created_at": snap_iso},
            },
            upsert=True,
        )
        upserted += 1
        if upserted % 100 == 0:
            logger.info("reliability_snapshots progress: upserted=%s", upserted)

    return {"snapshot_at": snap_iso, "upserted": upserted}


async def get_snapshot_for_equipment(
    equipment_id: str,
    *,
    at: Optional[datetime] = None,
    user: Optional[dict] = None,
) -> Optional[dict]:
    """Return snapshot at timestamp or latest for equipment."""
    tid = tenant_id_from_user(user)
    base: Dict[str, Any] = {"equipment_id": equipment_id}
    if user:
        base = scoped(user, base)
    elif tid:
        base["tenant_id"] = tid

    if at is None:
        return await db[COLLECTION].find_one(
            base,
            {"_id": 0},
            sort=[("snapshot_at", -1)],
        )

    at_iso = _to_iso(at)
    exact = await db[COLLECTION].find_one({**base, "snapshot_at": at_iso}, {"_id": 0})
    if exact:
        return exact

    return await db[COLLECTION].find_one(
        {**base, "snapshot_at": {"$lte": at_iso}},
        {"_id": 0},
        sort=[("snapshot_at", -1)],
    )


async def get_week_over_week_delta(
    equipment_id: str,
    *,
    user: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Compare latest snapshot to snapshot ~7 days prior."""
    latest = await get_snapshot_for_equipment(equipment_id, user=user)
    if not latest:
        return None

    latest_at = _parse_iso8601(latest["snapshot_at"])
    week_ago = latest_at - timedelta(days=7)
    prior = await get_snapshot_for_equipment(equipment_id, at=week_ago, user=user)
    if not prior:
        return {"latest": latest, "prior": None, "delta": None}

    delta = {
        "health_score": round(latest["health_score"] - prior["health_score"], 1),
        "open_threat_count": latest["open_threat_count"] - prior["open_threat_count"],
        "overdue_pm_count": latest["overdue_pm_count"] - prior["overdue_pm_count"],
        "edge_fingerprint_changed": latest.get("edge_fingerprint") != prior.get("edge_fingerprint"),
        "days_apart": round((latest_at - _parse_iso8601(prior["snapshot_at"])).total_seconds() / 86400, 1),
    }
    return {"latest": latest, "prior": prior, "delta": delta}


async def get_graph_at_time(
    equipment_id: str,
    at: datetime,
    *,
    user: Optional[dict] = None,
    limit: int = 500,
) -> Dict[str, Any]:
    """Active graph edges for equipment as they existed at timestamp ``at``."""
    tid = tenant_id_from_user(user)
    edges = await _active_edges_at(equipment_id, at, tenant_id=tid)
    return {
        "equipment_id": equipment_id,
        "at": _to_iso(at),
        "edges": edges[:limit],
        "total": len(edges),
    }
