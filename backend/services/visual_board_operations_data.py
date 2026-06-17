"""Widget data for production + operations visual management boards."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.tenant_schema import merge_tenant_filter
from services.user_stats_service import UserStatsService


def _production_kpi_payload(metric: str, kpis: Dict[str, Any]) -> Dict[str, Any]:
    mapping = {
        "total_input": {
            "formatted_value": f"{kpis.get('total_input', 0):,.0f}",
            "unit": "kg",
            "subtitle": kpis.get("lot_info") or "",
            "detail": f"{kpis.get('sample_count', 0)} samples",
        },
        "waste": {
            "formatted_value": f"{kpis.get('waste', 0):,.0f}",
            "unit": "kg",
            "subtitle": f"{kpis.get('waste_pct', 0)}% of input",
            "detail": f"{kpis.get('waste_reporting_count', 0)} entries",
        },
        "yield": {
            "formatted_value": str(kpis.get("yield_pct", 0)),
            "unit": "%",
            "subtitle": f"Target: {kpis.get('yield_target', 92)}%",
        },
        "avg_mooney": {
            "formatted_value": str(kpis.get("avg_viscosity", "0")),
            "unit": "MU",
            "subtitle": f"Range: {kpis.get('viscosity_range', '—')}",
            "detail": f"{kpis.get('viscosity_sample_count', 0)} samples",
        },
        "rsd": {
            "formatted_value": str(kpis.get("rsd", 0)),
            "unit": "%",
            "subtitle": f"Target: < {kpis.get('rsd_target', 7)}",
        },
        "runtime": {
            "formatted_value": _format_runtime(kpis.get("runtime_hours")),
            "unit": "",
            "subtitle": "",
        },
    }
    row = mapping.get(metric, {})
    return {
        "type": "production_kpi",
        "metric": metric,
        "formatted_value": row.get("formatted_value", "—"),
        "unit": row.get("unit", ""),
        "subtitle": row.get("subtitle", ""),
        "detail": row.get("detail", ""),
    }


def _format_runtime(hours: Optional[float]) -> str:
    if hours is None:
        return "0h"
    try:
        total_min = int(round(float(hours) * 60))
    except (TypeError, ValueError):
        return "0h"
    h, m = divmod(total_min, 60)
    return f"{h}h {m}m" if m else f"{h}h"


async def production_dashboard_for_user(user: dict, period: str = "today") -> Dict[str, Any]:
    from services.production_dashboard_service import get_or_compute_production_dashboard

    today = datetime.now(timezone.utc).date()
    if period == "week":
        from_date = (today - timedelta(days=6)).isoformat()
        return await get_or_compute_production_dashboard(
            user, from_date=from_date, to_date=today.isoformat()
        )
    return await get_or_compute_production_dashboard(user, date=today.isoformat())


async def build_production_kpi(user: dict, metric: str, period: str = "today") -> Dict[str, Any]:
    data = await production_dashboard_for_user(user, period)
    return _production_kpi_payload(metric, data.get("kpis") or {})


async def build_mooney_chart(user: dict, period: str = "today") -> Dict[str, Any]:
    data = await production_dashboard_for_user(user, period)
    points: List[Dict[str, Any]] = []
    for row in data.get("viscosity_series") or []:
        time_label = row.get("time") or row.get("local_time") or ""
        if not time_label and row.get("datetime"):
            time_label = str(row.get("datetime"))[11:16]
        visc = row.get("viscosity")
        if visc is None:
            continue
        points.append({"time": time_label, "viscosity": float(visc)})
    if not points:
        for row in data.get("production_log") or []:
            time_label = row.get("time") or row.get("datetime", "")[11:16] if row.get("datetime") else ""
            visc = row.get("viscosity")
            if visc is not None:
                points.append({"time": time_label, "viscosity": float(visc)})
    return {
        "type": "mooney_chart",
        "points": points,
        "target_min": 55,
        "target_max": 65,
        "band_min": 50,
        "band_max": 70,
    }


async def build_information_panel(
    user: dict,
    *,
    period: str = "today",
    limit: int = 12,
) -> Dict[str, Any]:
    data = await production_dashboard_for_user(user, period)
    entries = data.get("information_entries") or []
    items = []
    for row in entries[: max(1, limit)]:
        items.append(
            {
                "text": row.get("text") or "",
                "submitted_at": row.get("submitted_at") or row.get("datetime"),
                "time": row.get("time"),
                "submitted_by": row.get("submitted_by") or "—",
                "submission_id": row.get("submission_id"),
                "pinned": bool(row.get("pinned")),
            }
        )
    return {"type": "information_panel", "items": items, "total": len(entries)}


async def build_form_submissions_list(user: dict, limit: int = 8) -> Dict[str, Any]:
    filt = merge_tenant_filter({}, user)
    cursor = db.form_submissions.find(
        filt,
        {
            "_id": 0,
            "id": 1,
            "template_name": 1,
            "form_name": 1,
            "submitted_at": 1,
            "submitted_by": 1,
            "submitted_by_name": 1,
            "status": 1,
        },
    ).sort("submitted_at", -1).limit(limit)
    items = []
    async for row in cursor:
        name = row.get("template_name") or row.get("form_name") or "Form"
        items.append(
            {
                "id": row.get("id"),
                "title": name,
                "submitted_at": row.get("submitted_at"),
                "submitted_by": row.get("submitted_by_name") or row.get("submitted_by") or "—",
                "status": row.get("status") or "completed",
            }
        )
    return {"type": "form_submissions_list", "items": items, "total": len(items)}


async def build_risk_observation_list(user: dict, limit: int = 10) -> Dict[str, Any]:
    from services.threat_service import list_top_threats

    threats = await list_top_threats(user, limit=limit)
    items = []
    for row in threats:
        rpn = row.get("fmea_rpn") or row.get("rpn") or row.get("risk_score")
        items.append(
            {
                "id": row.get("id"),
                "title": row.get("title") or row.get("failure_mode") or "Observation",
                "equipment": row.get("asset_name") or row.get("asset") or row.get("equipment_name") or "—",
                "description": row.get("description") or row.get("symptom") or "",
                "risk_score": row.get("risk_score"),
                "rpn": rpn,
                "status": row.get("status") or row.get("lifecycle_stage") or "—",
                "created_at": row.get("created_at"),
            }
        )
    return {"type": "risk_observation_list", "items": items, "total": len(items)}


async def build_page_views_kpi(user: dict) -> Dict[str, Any]:
    stats = UserStatsService(db)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=30)
    summary = await stats.get_user_statistics(start_date=start, end_date=end)
    total = int(summary.get("total_views") or 0)
    return {
        "type": "kpi_card",
        "value": total,
        "formatted_value": f"{total:,}",
        "subtitle": "Total loads",
        "evidence_count": None,
        "change_percent": None,
        "trend": None,
    }
