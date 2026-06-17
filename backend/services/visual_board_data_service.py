"""
Visual Management Board widget data aggregation.

Maps widget configurations to scoped read queries, reusing executive dashboard patterns.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import db
from models.visual_board import (
    PublicBoardDataResponse,
    PublicLayoutResponse,
    ReliabilityStatus,
    StatusIndicatorPayload,
    VisualBoardLayout,
    VisualBoardWidget,
    WidgetType,
)
from services.executive_dashboard_service import (
    TERMINAL_OBSERVATION_STATUSES,
    get_or_compute_executive_dashboard,
)
from services.tenant_schema import merge_tenant_filter
from services.visual_board_service import resolve_token, tenant_display_user

logger = logging.getLogger(__name__)

_OPEN_OBSERVATION_STATUSES = {"open", "active", "in_progress", "new", "identified"}


async def get_public_layout(raw_token: str) -> PublicLayoutResponse:
    ctx = await resolve_token(raw_token)
    board = ctx["board"]
    version = ctx["version"]
    widgets_raw = version.get("widgets") or board.get("widgets") or []
    widgets = [VisualBoardWidget(**w) for w in widgets_raw]
    layout_raw = version.get("layout") or board.get("layout") or {}
    layout = VisualBoardLayout(**layout_raw)
    return PublicLayoutResponse(
        board_id=board["id"],
        name=board.get("name", ""),
        version=int(version.get("version") or board.get("version") or 1),
        layout=layout,
        widgets=widgets,
        refresh_interval_seconds=int(board.get("refresh_interval_seconds") or 30),
        theme=board.get("theme", "dark"),
    )


async def compute_reliability_status(user: dict) -> StatusIndicatorPayload:
    obs_filter = merge_tenant_filter(
        {
            "status": {"$nin": list(TERMINAL_OBSERVATION_STATUSES)},
            "$or": [
                {"risk_level": {"$in": ["critical", "high"]}},
                {"severity": {"$in": ["critical", "high"]}},
            ],
        },
        user,
    )
    critical_obs = await db.threats.count_documents(obs_filter)

    now_iso = datetime.now(timezone.utc).isoformat()
    action_filter = merge_tenant_filter(
        {
            "priority": {"$in": ["critical", "high"]},
            "status": {"$nin": ["completed", "closed", "cancelled", "done"]},
            "due_date": {"$lt": now_iso},
        },
        user,
    )
    critical_overdue = await db.central_actions.count_documents(action_filter)

    if critical_obs > 0 and critical_overdue > 0:
        status = ReliabilityStatus.RED
        reason = f"{critical_obs} Critical Observation{'s' if critical_obs != 1 else ''}, {critical_overdue} Overdue Critical Action{'s' if critical_overdue != 1 else ''}"
    elif critical_obs > 0:
        status = ReliabilityStatus.AMBER
        reason = f"{critical_obs} Critical Observation{'s' if critical_obs != 1 else ''}"
    else:
        status = ReliabilityStatus.GREEN
        reason = "No critical observations"

    return StatusIndicatorPayload(
        status=status,
        reason=reason,
        critical_observations=critical_obs,
        critical_overdue_actions=critical_overdue,
    )


def _kpi_payload(kpi) -> Dict[str, Any]:
    return {
        "type": WidgetType.KPI_CARD.value,
        "value": kpi.value,
        "formatted_value": kpi.formatted_value,
        "previous_value": kpi.previous_value,
        "change_percent": kpi.change_percent,
        "trend": kpi.trend,
        "tooltip": kpi.tooltip,
        "evidence_count": kpi.evidence_count,
    }


async def _observation_list_payload(user: dict, limit: int = 10) -> Dict[str, Any]:
    cursor = db.threats.find(
        merge_tenant_filter(
            {"status": {"$nin": list(TERMINAL_OBSERVATION_STATUSES)}},
            user,
        ),
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "equipment_name": 1,
            "asset": 1,
            "asset_name": 1,
            "severity": 1,
            "risk_level": 1,
            "status": 1,
            "risk_score": 1,
            "exposure_value": 1,
            "production_exposure": 1,
        },
    ).sort("risk_score", -1).limit(limit)
    rows = await cursor.to_list(limit)
    items = []
    for row in rows:
        items.append(
            {
                "id": row.get("id"),
                "asset": row.get("asset_name") or row.get("equipment_name") or "—",
                "risk": row.get("risk_level") or row.get("severity") or row.get("risk_score"),
                "exposure": row.get("exposure_value") or row.get("production_exposure"),
                "status": row.get("status"),
                "title": row.get("title"),
            }
        )
    return {"type": WidgetType.OBSERVATION_LIST.value, "items": items, "total": len(items)}


async def _action_queue_payload(
    user: dict,
    limit: int = 10,
    *,
    queue_mode: str = "open",
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    fields = {
        "_id": 0,
        "id": 1,
        "title": 1,
        "description": 1,
        "owner": 1,
        "assigned_to": 1,
        "owner_name": 1,
        "due_date": 1,
        "status": 1,
        "priority": 1,
        "equipment_name": 1,
        "asset_name": 1,
        "updated_at": 1,
    }
    if queue_mode == "recent":
        filt = merge_tenant_filter({}, user)
        cursor = db.central_actions.find(filt, fields).sort("updated_at", -1).limit(limit)
    else:
        cursor = db.central_actions.find(
            merge_tenant_filter(
                {"status": {"$nin": ["completed", "closed", "cancelled", "done"]}},
                user,
            ),
            fields,
        ).sort([("due_date", 1), ("priority", -1)]).limit(limit)
    rows = await cursor.to_list(limit)
    items = []
    for row in rows:
        due = row.get("due_date")
        overdue = bool(due and due < now_iso)
        items.append(
            {
                "id": row.get("id"),
                "action": row.get("title") or row.get("description") or "—",
                "subtitle": row.get("equipment_name") or row.get("asset_name") or "",
                "owner": row.get("owner_name") or row.get("owner") or row.get("assigned_to") or "—",
                "due_date": due,
                "status": row.get("status") or "open",
                "priority": row.get("priority"),
                "overdue": overdue,
            }
        )
    return {"type": WidgetType.ACTION_QUEUE.value, "items": items, "total": len(items)}


async def _trend_chart_payload(
    user: dict,
    *,
    chart_metric: str = "active_threat_exposure",
    days: int = 30,
    period_days: int = 30,
) -> Dict[str, Any]:
    """Build time-series from executive dashboard snapshots or daily observation counts."""
    tenant_id = user.get("company_id")
    points: list[dict] = []
    metric_key = chart_metric or "active_threat_exposure"

    if tenant_id:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        cursor = db.executive_dashboard_snapshots.find(
            {"tenant_id": tenant_id, "refreshed_at": {"$gte": since}},
            {"_id": 0, "refreshed_at": 1, "payload": 1},
        ).sort("refreshed_at", 1).limit(60)
        snapshots = await cursor.to_list(60)
        for snap in snapshots:
            payload = snap.get("payload") or {}
            kpi = (payload.get("kpi_cards") or {}).get(metric_key)
            if kpi is None:
                continue
            val = kpi.get("value") if isinstance(kpi, dict) else getattr(kpi, "value", None)
            if val is not None:
                points.append({"date": snap.get("refreshed_at", "")[:10], "value": float(val)})

    if len(points) < 2:
        dashboard = await get_or_compute_executive_dashboard(user, period_days)
        kpi = dashboard.kpi_cards.get(metric_key)
        current = float(kpi.value) if kpi else 0.0
        previous = float(kpi.previous_value) if kpi and kpi.previous_value is not None else current
        today = datetime.now(timezone.utc).date()
        mid = today - timedelta(days=days // 2)
        start = today - timedelta(days=days)
        points = [
            {"date": start.isoformat(), "value": previous},
            {"date": mid.isoformat(), "value": (previous + current) / 2},
            {"date": today.isoformat(), "value": current},
        ]

    if metric_key == "observation_count":
        since_dt = datetime.now(timezone.utc) - timedelta(days=days)
        filt = merge_tenant_filter(
            {
                "created_at": {"$gte": since_dt.isoformat()},
                "status": {"$nin": list(TERMINAL_OBSERVATION_STATUSES)},
            },
            user,
        )
        pipeline = [
            {"$match": filt},
            {
                "$group": {
                    "_id": {"$substr": ["$created_at", 0, 10]},
                    "value": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
        try:
            agg = await db.threats.aggregate(pipeline).to_list(days + 1)
            if agg:
                points = [{"date": row["_id"], "value": float(row["value"])} for row in agg if row.get("_id")]
        except Exception:
            pass

    return {
        "type": WidgetType.TREND_CHART.value,
        "metric": metric_key,
        "points": points,
        "days": days,
    }


def _waterfall_payload(dashboard) -> Dict[str, Any]:
    metrics = dashboard.exposure_metrics
    segments = [
        {"label": "Total Lifecycle Exposure", "value": metrics.total_lifecycle_exposure},
        {"label": "Covered by Controls", "value": metrics.covered_by_controls},
        {"label": "Uncovered Exposure", "value": metrics.uncovered_exposure},
        {"label": "Active Threat Exposure", "value": metrics.active_threat_exposure},
        {"label": "Resolved Exposure", "value": metrics.resolved_exposure},
    ]
    return {
        "type": WidgetType.EXPOSURE_WATERFALL.value,
        "segments": segments,
        "waterfall_data": dashboard.waterfall_data,
        "currency": metrics.currency,
        "currency_symbol": metrics.currency_symbol,
    }


async def build_widget_data(
    widgets: List[VisualBoardWidget],
    user: dict,
    *,
    period_days: int = 30,
) -> Dict[str, Any]:
    dashboard = await get_or_compute_executive_dashboard(user, period_days)
    status = await compute_reliability_status(user)
    result: Dict[str, Any] = {}

    for widget in widgets:
        wtype = widget.type.value if hasattr(widget.type, "value") else widget.type
        if wtype == WidgetType.KPI_CARD.value:
            metric = widget.config.metric or "active_threat_exposure"
            if metric == "page_views":
                from services.visual_board_operations_data import build_page_views_kpi

                result[widget.id] = await build_page_views_kpi(user)
            else:
                kpi = dashboard.kpi_cards.get(metric)
                if kpi:
                    result[widget.id] = _kpi_payload(kpi)
                else:
                    result[widget.id] = {
                        "type": WidgetType.KPI_CARD.value,
                        "value": 0,
                        "formatted_value": "—",
                        "error": f"Unknown metric: {metric}",
                    }
        elif wtype == WidgetType.STATUS_INDICATOR.value:
            result[widget.id] = {
                "type": WidgetType.STATUS_INDICATOR.value,
                "status": status.status.value,
                "reason": status.reason,
                "critical_observations": status.critical_observations,
                "critical_overdue_actions": status.critical_overdue_actions,
            }
        elif wtype == WidgetType.OBSERVATION_LIST.value:
            result[widget.id] = await _observation_list_payload(user, widget.config.limit)
        elif wtype == WidgetType.EXPOSURE_WATERFALL.value:
            result[widget.id] = _waterfall_payload(dashboard)
        elif wtype == WidgetType.ACTION_QUEUE.value:
            result[widget.id] = await _action_queue_payload(
                user,
                widget.config.limit,
                queue_mode=widget.config.queue_mode or "open",
            )
        elif wtype == WidgetType.TREND_CHART.value:
            result[widget.id] = await _trend_chart_payload(
                user,
                chart_metric=widget.config.chart_metric or widget.config.metric or "active_threat_exposure",
                days=widget.config.days or 30,
                period_days=period_days,
            )
        elif wtype == WidgetType.PRODUCTION_KPI.value:
            from services.visual_board_operations_data import build_production_kpi

            result[widget.id] = await build_production_kpi(
                user,
                widget.config.production_metric or "total_input",
                period=widget.config.period or "today",
            )
        elif wtype == WidgetType.MOONEY_CHART.value:
            from services.visual_board_operations_data import build_mooney_chart

            result[widget.id] = await build_mooney_chart(
                user, period=widget.config.period or "today"
            )
        elif wtype == WidgetType.FORM_SUBMISSIONS_LIST.value:
            from services.visual_board_operations_data import build_form_submissions_list

            result[widget.id] = await build_form_submissions_list(user, widget.config.limit)
        elif wtype == WidgetType.RISK_OBSERVATION_LIST.value:
            from services.visual_board_operations_data import build_risk_observation_list

            result[widget.id] = await build_risk_observation_list(user, widget.config.limit)
        else:
            result[widget.id] = {
                "type": wtype,
                "error": f"Unsupported widget type: {wtype}",
            }

    return result


async def get_public_data(raw_token: str, *, period_days: int = 30) -> PublicBoardDataResponse:
    ctx = await resolve_token(raw_token)
    board = ctx["board"]
    version = ctx["version"]
    tenant_id = ctx.get("tenant_id")
    user = tenant_display_user(tenant_id)

    widgets_raw = version.get("widgets") or board.get("widgets") or []
    widgets = [VisualBoardWidget(**w) for w in widgets_raw]
    status = await compute_reliability_status(user)
    widget_data = await build_widget_data(widgets, user, period_days=period_days)

    return PublicBoardDataResponse(
        board_id=board["id"],
        version=int(version.get("version") or board.get("version") or 1),
        last_updated=datetime.now(timezone.utc).isoformat(),
        status=status,
        widgets=widget_data,
    )


async def get_board_preview_data(
    board_id: str,
    user: dict,
    *,
    period_days: int = 30,
) -> PublicBoardDataResponse:
    from services.visual_board_service import get_board

    board_resp = await get_board(board_id, user)
    widgets = board_resp.widgets
    status = await compute_reliability_status(user)
    widget_data = await build_widget_data(widgets, user, period_days=period_days)
    return PublicBoardDataResponse(
        board_id=board_id,
        version=board_resp.version,
        last_updated=datetime.now(timezone.utc).isoformat(),
        status=status,
        widgets=widget_data,
    )
