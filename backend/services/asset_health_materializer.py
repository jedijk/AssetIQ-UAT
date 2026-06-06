"""
Materialize per-equipment asset health snapshots into asset_health_documents.

Daily refresh job writes one document per equipment per snapshot_date with
reliability KPI proxies aligned with executive_reliability_kpis patterns.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db

logger = logging.getLogger(__name__)

COLLECTION = "asset_health_documents"

EQUIPMENT_LEVELS = ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"]


async def _equipment_mtbf_proxy_days(equipment_id: str, since: datetime) -> Optional[float]:
    """Mean days between resolved threats for one equipment (90d window)."""
    match = {
        "linked_equipment_id": equipment_id,
        "status": {"$in": ["Resolved", "resolved", "Closed", "closed"]},
        "created_at": {"$gte": since},
    }
    cursor = db.threats.find(match, {"_id": 0, "created_at": 1}).sort("created_at", 1)
    dates: List[datetime] = []
    async for row in cursor:
        d = row.get("created_at")
        if isinstance(d, datetime):
            dates.append(d if d.tzinfo else d.replace(tzinfo=timezone.utc))
    if len(dates) < 2:
        return None
    intervals = [
        (dates[i] - dates[i - 1]).total_seconds() / 86400
        for i in range(1, len(dates))
        if (dates[i] - dates[i - 1]).total_seconds() > 0
    ]
    if not intervals:
        return None
    return round(sum(intervals) / len(intervals), 1)


async def compute_equipment_snapshot(
    equipment_id: str,
    *,
    snapshot_date: Optional[str] = None,
    equipment_doc: Optional[dict] = None,
) -> Dict[str, Any]:
    """Build a single equipment health snapshot document."""
    now = datetime.now(timezone.utc)
    snap_date = snapshot_date or now.date().isoformat()
    today_iso = snap_date

    eq = equipment_doc or await db.equipment_nodes.find_one(
        {"id": equipment_id},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "equipment_type_id": 1},
    )

    threat_scope = {
        "linked_equipment_id": equipment_id,
        "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
    }
    open_threats = await db.threats.count_documents(threat_scope)
    high_risk_threats = await db.threats.count_documents({
        **threat_scope,
        "risk_level": {"$in": ["High", "high", "Critical", "critical"]},
    })

    overdue_scheduled = await db.scheduled_tasks.count_documents({
        "equipment_id": equipment_id,
        "status": {"$nin": ["completed", "cancelled"]},
        "due_date": {"$lt": today_iso},
    })
    overdue_instances = await db.task_instances.count_documents({
        "equipment_id": equipment_id,
        "status": {"$in": ["pending", "overdue", "scheduled"]},
        "due_date": {"$lt": now},
    })
    overdue_pm_total = overdue_scheduled + overdue_instances

    window_start = now - timedelta(days=90)
    mtbf_proxy_days = await _equipment_mtbf_proxy_days(equipment_id, window_start)

    # Reliability score proxy (aligned with executive dashboard heuristic)
    base_score = 85.0
    score = base_score - (high_risk_threats * 5) - min(overdue_pm_total * 2, 20)
    if mtbf_proxy_days is not None and mtbf_proxy_days < 14:
        score -= 10
    reliability_score = round(max(0.0, min(100.0, score)), 1)

    return {
        "equipment_id": equipment_id,
        "equipment_name": (eq or {}).get("name"),
        "equipment_tag": (eq or {}).get("tag"),
        "equipment_type_id": (eq or {}).get("equipment_type_id"),
        "snapshot_date": snap_date,
        "reliability_score": reliability_score,
        "open_threats": open_threats,
        "high_risk_threats": high_risk_threats,
        "overdue_pm": {
            "scheduled_tasks": overdue_scheduled,
            "task_instances": overdue_instances,
            "total": overdue_pm_total,
        },
        "overdue_pm_flag": overdue_pm_total > 0,
        "mtbf_proxy_days": mtbf_proxy_days,
        "mtbf_proxy_window_days": 90,
        "generated_at": now.isoformat(),
    }


async def refresh_asset_health_documents(
    *,
    snapshot_date: Optional[str] = None,
    equipment_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Upsert snapshots for all (or selected) equipment."""
    snap_date = snapshot_date or datetime.now(timezone.utc).date().isoformat()
    query: Dict[str, Any] = {"level": {"$in": EQUIPMENT_LEVELS}}
    if equipment_ids:
        query["id"] = {"$in": list(equipment_ids)}

    upserted = 0
    async for eq in db.equipment_nodes.find(query, {"_id": 0, "id": 1, "name": 1, "tag": 1, "equipment_type_id": 1}):
        eq_id = eq.get("id")
        if not eq_id:
            continue
        doc = await compute_equipment_snapshot(eq_id, snapshot_date=snap_date, equipment_doc=eq)
        await db[COLLECTION].update_one(
            {"equipment_id": eq_id, "snapshot_date": snap_date},
            {"$set": doc, "$setOnInsert": {"created_at": doc["generated_at"]}},
            upsert=True,
        )
        upserted += 1

    return {"snapshot_date": snap_date, "upserted": upserted}
