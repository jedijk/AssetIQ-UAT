"""
Executive reliability KPI aggregation — open threats, overdue PM, MTBF proxies.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db


async def compute_executive_reliability_kpis(
    owner_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute installation-wide executive KPIs."""
    now = datetime.now(timezone.utc)
    today_iso = now.date().isoformat()

    open_threats = await db.threats.count_documents({
        "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
    })

    high_risk_threats = await db.threats.count_documents({
        "status": {"$in": ["Open", "open", "In Progress", "in_progress"]},
        "risk_level": {"$in": ["High", "high", "Critical", "critical"]},
    })

    overdue_pm_scheduled = await db.scheduled_tasks.count_documents({
        "status": {"$nin": ["completed", "cancelled"]},
        "due_date": {"$lt": today_iso},
    })

    overdue_pm_instances = await db.task_instances.count_documents({
        "status": {"$in": ["pending", "overdue", "scheduled"]},
        "due_date": {"$lt": now},
    })

    open_work_total = overdue_pm_scheduled + overdue_pm_instances

    # MTBF proxy: mean days between resolved threats per equipment (90d window)
    window_start = now - timedelta(days=90)
    mtbf_by_equipment = await _mtbf_proxy_days(window_start)

    fleet_mtbf_days = None
    if mtbf_by_equipment:
        fleet_mtbf_days = round(
            sum(mtbf_by_equipment) / len(mtbf_by_equipment), 1
        )

    worst_equipment = await _worst_mtbf_equipment(window_start, limit=5)

    return {
        "open_threats": open_threats,
        "high_risk_threats": high_risk_threats,
        "overdue_pm": {
            "scheduled_tasks": overdue_pm_scheduled,
            "task_instances": overdue_pm_instances,
            "total": open_work_total,
        },
        "mtbf_proxy": {
            "fleet_mean_days": fleet_mtbf_days,
            "sample_equipment_count": len(mtbf_by_equipment),
            "window_days": 90,
            "worst_performers": worst_equipment,
        },
        "generated_at": now.isoformat(),
    }


async def _mtbf_proxy_days(since: datetime) -> List[float]:
    """Return inter-failure intervals (days) per equipment from resolved threats."""
    pipeline = [
        {
            "$match": {
                "status": {"$in": ["Resolved", "resolved", "Closed", "closed"]},
                "created_at": {"$gte": since},
                "linked_equipment_id": {"$exists": True, "$ne": None},
            }
        },
        {"$sort": {"linked_equipment_id": 1, "created_at": 1}},
        {
            "$group": {
                "_id": "$linked_equipment_id",
                "dates": {"$push": "$created_at"},
            }
        },
    ]
    intervals: List[float] = []
    async for row in db.threats.aggregate(pipeline):
        dates = row.get("dates") or []
        if len(dates) < 2:
            continue
        parsed = []
        for d in dates:
            if isinstance(d, datetime):
                parsed.append(d if d.tzinfo else d.replace(tzinfo=timezone.utc))
        parsed.sort()
        for i in range(1, len(parsed)):
            delta = (parsed[i] - parsed[i - 1]).total_seconds() / 86400
            if delta > 0:
                intervals.append(delta)
    return intervals


async def _worst_mtbf_equipment(since: datetime, *, limit: int = 5) -> List[dict]:
    """Equipment with shortest mean interval between failures (proxy)."""
    pipeline = [
        {
            "$match": {
                "status": {"$in": ["Resolved", "resolved", "Closed", "closed"]},
                "created_at": {"$gte": since},
                "linked_equipment_id": {"$exists": True, "$ne": None},
            }
        },
        {"$sort": {"linked_equipment_id": 1, "created_at": 1}},
        {
            "$group": {
                "_id": "$linked_equipment_id",
                "failure_count": {"$sum": 1},
                "first_at": {"$min": "$created_at"},
                "last_at": {"$max": "$created_at"},
            }
        },
        {"$match": {"failure_count": {"$gte": 2}}},
        {
            "$addFields": {
                "span_days": {
                    "$divide": [
                        {"$subtract": ["$last_at", "$first_at"]},
                        86400000,
                    ]
                }
            }
        },
        {
            "$addFields": {
                "mtbf_proxy_days": {
                    "$divide": ["$span_days", {"$subtract": ["$failure_count", 1]}]
                }
            }
        },
        {"$sort": {"mtbf_proxy_days": 1}},
        {"$limit": limit},
    ]
    results = []
    async for row in db.threats.aggregate(pipeline):
        eq_id = row.get("_id")
        eq = await db.equipment_nodes.find_one(
            {"id": eq_id},
            {"_id": 0, "id": 1, "name": 1, "tag": 1},
        )
        results.append({
            "equipment_id": eq_id,
            "equipment_name": (eq or {}).get("name"),
            "equipment_tag": (eq or {}).get("tag"),
            "failure_count": row.get("failure_count"),
            "mtbf_proxy_days": round(row.get("mtbf_proxy_days") or 0, 1),
        })
    return results
