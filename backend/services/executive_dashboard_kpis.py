"""Executive dashboard KPI orchestration and snapshot caching."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from database import db
from services.executive_dashboard_exposure import (
    _fetch_scoped_equipment_nodes,
    _fetch_scoped_observations,
    _threat_ids_with_linked_actions,
    compute_exposure_dashboard_section,
)
from services.executive_dashboard_models import (
    ExecutiveDashboardResponse,
    ExposureMetrics,
    KPICard,
    _datetime_range_query,
    calculate_trend,
    format_currency,
)
from services.tenant_schema import merge_tenant_filter
from services.visual_board_helpers import is_vmb_display_user

logger = logging.getLogger(__name__)


async def _fetch_open_action_rows(user: dict, limit: int = 10) -> list:
    """Open actions for visual board widgets (materialized in executive snapshot)."""
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
        items.append({
            "id": row.get("id"),
            "action": row.get("title") or row.get("description") or "—",
            "subtitle": row.get("equipment_name") or row.get("asset_name") or "",
            "owner": row.get("owner_name") or row.get("assigned_to") or row.get("owner") or "—",
            "due_date": due,
            "status": row.get("status") or "open",
            "priority": row.get("priority"),
            "overdue": bool(due and due < now_iso),
            "updated_at": row.get("updated_at"),
        })
    return items


async def count_digital_executions(
    start: datetime,
    end: datetime,
    current_user: dict,
) -> int:
    """Count tenant-wide form submissions and completed tasks in a time window."""
    form_window = {
        "$or": [
            _datetime_range_query("submitted_at", start, end),
            _datetime_range_query("created_at", start, end),
        ]
    }
    form_count = await db.form_submissions.count_documents(
        merge_tenant_filter(form_window, current_user)
    )

    task_window = merge_tenant_filter(
        {
            "status": "completed",
            **_datetime_range_query("completed_at", start, end),
        },
        current_user,
    )
    task_count = await db.scheduled_tasks.count_documents(task_window)
    return form_count + task_count


async def count_digital_executions_total(current_user: dict) -> int:
    """All-time tenant-wide count of form submissions and completed tasks."""
    form_count = await db.form_submissions.count_documents(
        merge_tenant_filter({}, current_user)
    )
    task_count = await db.scheduled_tasks.count_documents(
        merge_tenant_filter(
            {
                "status": "completed",
                "completed_at": {"$exists": True, "$nin": [None, ""]},
            },
            current_user,
        )
    )
    return form_count + task_count


async def build_executive_dashboard(
    current_user: dict,
    period_days: int = 30,
) -> ExecutiveDashboardResponse:
    """Compute executive dashboard payload (live aggregation)."""
    user_id = current_user["id"]

    hourly_cost = 500.0
    currency = "EUR"
    currency_symbol = "€"

    try:
        user_prefs = await db.user_preferences.find_one(
            merge_tenant_filter({"user_id": user_id}, current_user)
        )
        if user_prefs and user_prefs.get("production_loss_config"):
            config = user_prefs["production_loss_config"]
            hourly_cost = config.get("hourly_cost", 500.0)
            currency = config.get("currency", "EUR")
            currency_symbols = {
                "EUR": "€",
                "USD": "$",
                "GBP": "£",
                "CHF": "CHF ",
                "NOK": "kr ",
                "SEK": "kr ",
                "DKK": "kr ",
            }
            currency_symbol = currency_symbols.get(currency, "€")
    except Exception as e:
        logger.warning(f"Could not fetch user preferences: {e}")

    now = datetime.now(timezone.utc)
    current_period_start = now - timedelta(days=period_days)
    previous_period_start = current_period_start - timedelta(days=period_days)
    current_period_start_iso = current_period_start.isoformat()
    previous_period_start_iso = previous_period_start.isoformat()
    now_iso = now.isoformat()

    def _format_report_period_label(start: datetime, end: datetime) -> str:
        return f"{start.strftime('%d %b %Y')} – {end.strftime('%d %b %Y')}"

    report_period = {
        "period_days": period_days,
        "from": current_period_start_iso,
        "to": now_iso,
        "previous_from": previous_period_start_iso,
        "previous_to": current_period_start_iso,
        "label": _format_report_period_label(current_period_start, now),
        "previous_label": _format_report_period_label(previous_period_start, current_period_start),
    }

    equipment_nodes, all_observations, threat_ids_with_actions = await asyncio.gather(
        _fetch_scoped_equipment_nodes(current_user),
        _fetch_scoped_observations(current_user),
        _threat_ids_with_linked_actions(current_user),
    )

    task_query = {} if is_vmb_display_user(current_user) else {"created_by": user_id}
    task_filter = merge_tenant_filter(task_query, current_user)
    current_tasks = await db.scheduled_tasks.find(
        {
            **task_filter,
            "scheduled_date": {"$gte": current_period_start_iso, "$lte": now_iso},
        }
    ).to_list(5000)
    previous_tasks = await db.scheduled_tasks.find(
        {
            **task_filter,
            "scheduled_date": {"$gte": previous_period_start_iso, "$lt": current_period_start_iso},
        }
    ).to_list(5000)

    exposure = await compute_exposure_dashboard_section(
        current_user=current_user,
        equipment_nodes=equipment_nodes,
        all_observations=all_observations,
        threat_ids_with_actions=threat_ids_with_actions,
        current_period_start=current_period_start,
        hourly_cost=hourly_cost,
        currency_symbol=currency_symbol,
    )

    total_lifecycle_exposure = exposure["total_lifecycle_exposure"]
    assessed_equipment_count = exposure["assessed_equipment_count"]
    covered_by_controls = exposure["covered_by_controls"]
    uncovered_exposure = exposure["uncovered_exposure"]
    prev_covered = exposure["prev_covered"]
    prev_uncovered = exposure["prev_uncovered"]
    covered_equipment_count = exposure["covered_equipment_count"]
    uncovered_equipment_count = exposure["uncovered_equipment_count"]
    active_threat_exposure = exposure["active_threat_exposure"]
    controlled_active_exposure = exposure["controlled_active_exposure"]
    resolved_exposure = exposure["resolved_exposure"]
    prev_active_threat = exposure["prev_active_threat"]
    prev_controlled_active = exposure["prev_controlled_active"]
    prev_resolved_exposure = exposure["prev_resolved_exposure"]
    active_maintenance_program_count = exposure["active_maintenance_program_count"]
    assessment_scope_total = exposure["assessment_scope_total"]
    assessed_in_scope_count = exposure["assessed_in_scope_count"]
    assessment_coverage_pct = exposure["assessment_coverage_pct"]
    unassessed_assessment_count = exposure["unassessed_assessment_count"]
    covered_evidence = exposure["covered_evidence"]
    uncovered_evidence = exposure["uncovered_evidence"]
    unassessed_assessment_evidence = exposure["unassessed_assessment_evidence"]
    active_threat_evidence = exposure["active_threat_evidence"]
    controlled_active_evidence = exposure["controlled_active_evidence"]
    resolved_exposure_evidence = exposure["resolved_exposure_evidence"]

    coverage_current = (
        (covered_by_controls / total_lifecycle_exposure * 100)
        if total_lifecycle_exposure > 0
        else 0
    )
    coverage_change, coverage_trend = calculate_trend(
        covered_by_controls, prev_covered, higher_is_better=True
    )

    current_completed = len([t for t in current_tasks if t.get("status") == "completed"])
    current_total = len(current_tasks) if current_tasks else 0
    pm_compliance_current = (current_completed / current_total * 100) if current_total > 0 else 0

    previous_completed = len([t for t in previous_tasks if t.get("status") == "completed"])
    previous_total = len(previous_tasks) if previous_tasks else 0
    pm_compliance_previous = (
        (previous_completed / previous_total * 100)
        if previous_total > 0
        else pm_compliance_current
    )
    pm_change, pm_trend = calculate_trend(
        pm_compliance_current, pm_compliance_previous, higher_is_better=True
    )

    digital_current_period = await count_digital_executions(
        current_period_start, now, current_user
    )
    digital_previous_period = await count_digital_executions(
        previous_period_start, current_period_start, current_user
    )
    digital_total_submitted = await count_digital_executions_total(current_user)
    digital_change, digital_trend = calculate_trend(
        float(digital_current_period), float(digital_previous_period), higher_is_better=True
    )

    active_change, active_trend = calculate_trend(
        active_threat_exposure, prev_active_threat, higher_is_better=False
    )
    controlled_change, controlled_trend = calculate_trend(
        controlled_active_exposure, prev_controlled_active, higher_is_better=True
    )
    resolved_change, resolved_trend = calculate_trend(
        resolved_exposure, prev_resolved_exposure, higher_is_better=True
    )
    uncovered_change, uncovered_trend = calculate_trend(
        uncovered_exposure, prev_uncovered, higher_is_better=False
    )

    kpi_cards = {
        "exposure_coverage": KPICard(
            value=covered_by_controls,
            formatted_value=format_currency(covered_by_controls, currency_symbol),
            previous_value=prev_covered,
            previous_formatted=format_currency(prev_covered, currency_symbol),
            change_percent=coverage_change,
            trend=coverage_trend,
            tooltip=(
                f"Total assessed production exposure covered by {active_maintenance_program_count} "
                f"equipment with an active maintenance program or imported PM plan "
                f"({coverage_current:.0f}% of total assessed exposure). "
                "Coverage indicates that a program exists, not the quality or effectiveness of that coverage."
            ),
            evidence_count=active_maintenance_program_count,
        ),
        "uncovered_exposure": KPICard(
            value=uncovered_exposure,
            formatted_value=format_currency(uncovered_exposure, currency_symbol),
            previous_value=prev_uncovered,
            previous_formatted=format_currency(prev_uncovered, currency_symbol),
            change_percent=uncovered_change,
            trend=uncovered_trend,
            tooltip=(
                "Assessed production impact for equipment without an active maintenance program "
                f"or imported PM plan ({uncovered_equipment_count} assets)."
            ),
            evidence_count=uncovered_equipment_count,
        ),
        "assessment_coverage": KPICard(
            value=round(assessment_coverage_pct, 1),
            formatted_value=f"{assessment_coverage_pct:.0f}%",
            previous_value=None,
            change_percent=None,
            trend="stable",
            tooltip=(
                "Share of sub units and maintainable items with a production criticality assessment "
                f"({assessed_in_scope_count} of {assessment_scope_total} assessed)."
            ),
            evidence_count=unassessed_assessment_count,
        ),
        "active_threat_exposure": KPICard(
            value=active_threat_exposure,
            formatted_value=format_currency(active_threat_exposure, currency_symbol),
            previous_value=prev_active_threat,
            change_percent=active_change,
            trend=active_trend,
            tooltip=(
                "Production impact from active observations without a maintenance strategy, "
                f"program, or linked action plan ({len(active_threat_evidence)} observations)."
            ),
            evidence_count=len(active_threat_evidence),
        ),
        "critical_active_exposure": KPICard(
            value=controlled_active_exposure,
            formatted_value=format_currency(controlled_active_exposure, currency_symbol),
            previous_value=prev_controlled_active,
            change_percent=controlled_change,
            trend=controlled_trend,
            tooltip=(
                "Production impact from active observations covered by a maintenance strategy, "
                f"program, or linked action plan ({len(controlled_active_evidence)} observations)."
            ),
            evidence_count=len(controlled_active_evidence),
        ),
        "resolved_exposure": KPICard(
            value=resolved_exposure,
            formatted_value=format_currency(resolved_exposure, currency_symbol),
            previous_value=prev_resolved_exposure,
            change_percent=resolved_change,
            trend=resolved_trend,
            tooltip=(
                "Production impact from observations marked Mitigated "
                f"({len(resolved_exposure_evidence)} observations)."
            ),
            evidence_count=len(resolved_exposure_evidence),
        ),
        "pm_compliance": KPICard(
            value=round(pm_compliance_current, 1),
            formatted_value=f"{pm_compliance_current:.0f}%",
            previous_value=round(pm_compliance_previous, 1),
            change_percent=pm_change,
            trend=pm_trend,
            tooltip="Percentage of planned preventive maintenance activities completed within the reporting period.",
            evidence_count=current_completed,
        ),
        "digital_execution_rate": KPICard(
            value=float(digital_current_period),
            formatted_value=f"{digital_current_period:,}",
            previous_value=float(digital_previous_period),
            change_percent=digital_change,
            trend=digital_trend,
            tooltip="Tasks and forms submitted through AssetIQ in the selected report period.",
            evidence_count=0,
            total_submitted_count=digital_total_submitted,
            week_submitted_count=digital_current_period,
            report_period_label=report_period["label"],
            previous_period_label=report_period["previous_label"],
        ),
    }

    waterfall_data = [
        {
            "name": "Total Assessed Exposure",
            "value": total_lifecycle_exposure,
            "formatted": format_currency(total_lifecycle_exposure, currency_symbol),
            "type": "total",
            "color": "#64748b",
            "count": assessed_equipment_count,
            "count_unit": "equipment",
        },
        {
            "name": "Covered by Controls",
            "value": covered_by_controls,
            "formatted": format_currency(covered_by_controls, currency_symbol),
            "type": "positive",
            "color": "#22c55e",
            "count": active_maintenance_program_count,
            "count_unit": "equipment",
        },
        {
            "name": "Uncovered Exposure",
            "value": uncovered_exposure,
            "formatted": format_currency(uncovered_exposure, currency_symbol),
            "type": "negative",
            "color": "#f59e0b",
            "description": "Assessed production impact for equipment without a maintenance program",
            "count": uncovered_equipment_count,
            "count_unit": "equipment",
        },
        {
            "name": "Uncontrolled Active Exposure",
            "value": active_threat_exposure,
            "formatted": format_currency(active_threat_exposure, currency_symbol),
            "type": "warning",
            "color": "#f97316",
            "count": len(active_threat_evidence),
            "count_unit": "observations",
        },
        {
            "name": "Controlled Exposure",
            "value": controlled_active_exposure,
            "formatted": format_currency(controlled_active_exposure, currency_symbol),
            "type": "positive",
            "color": "#22c55e",
            "count": len(controlled_active_evidence),
            "count_unit": "observations",
        },
        {
            "name": "Resolved Exposure",
            "value": resolved_exposure,
            "formatted": format_currency(resolved_exposure, currency_symbol),
            "type": "positive",
            "color": "#6366f1",
            "count": len(resolved_exposure_evidence),
            "count_unit": "observations",
        },
    ]

    total_obs = len(all_observations)
    ai_summary = f"""AssetIQ is tracking {total_obs} identified reliability observations against {assessed_equipment_count} equipment assets with assessed production criticality, representing a total assessed exposure of {format_currency(total_lifecycle_exposure, currency_symbol)}.

{format_currency(covered_by_controls, currency_symbol)} ({coverage_current:.0f}%) of assessed exposure is covered by equipment with a maintenance program or imported PM plan. {format_currency(uncovered_exposure, currency_symbol)} remains uncovered across {uncovered_equipment_count} assessed assets without active controls.

Active observations without controls represent {format_currency(active_threat_exposure, currency_symbol)} in uncontrolled production exposure ({len(active_threat_evidence)} observations). {format_currency(controlled_active_exposure, currency_symbol)} of active exposure is controlled across {len(controlled_active_evidence)} observations with a strategy, program, or action plan. {format_currency(resolved_exposure, currency_symbol)} of production exposure has been resolved across {len(resolved_exposure_evidence)} mitigated observations.

PM compliance {"is strong" if pm_compliance_current >= 85 else "needs improvement"} at {pm_compliance_current:.0f}%. Digital execution recorded {digital_current_period} tasks and forms in the report period ({report_period['label']}) versus {digital_previous_period} in the previous period."""

    evidence_drill_down = {
        "covered_exposure": sorted(
            covered_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True
        )[:25],
        "uncovered_exposure": sorted(
            uncovered_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True
        )[:25],
        "unassessed_assessments": sorted(
            unassessed_assessment_evidence,
            key=lambda x: (x.get("level", ""), (x.get("asset") or "").lower()),
        ),
        "active_threat_exposure": sorted(
            active_threat_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True
        )[:25],
        "critical_active_exposure": sorted(
            controlled_active_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True
        )[:25],
        "resolved_exposure": sorted(
            resolved_exposure_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True
        )[:25],
        "open_actions": await _fetch_open_action_rows(current_user, limit=10),
    }

    outcome_summary = None
    try:
        from services.outcome_intelligence_service import compute_fleet_outcome_summary

        outcome_summary = await compute_fleet_outcome_summary(current_user)
    except Exception as exc:
        logger.warning("Failed to compute fleet outcome summary: %s", exc)

    response = ExecutiveDashboardResponse(
        exposure_metrics=ExposureMetrics(
            total_lifecycle_exposure=total_lifecycle_exposure,
            covered_by_controls=covered_by_controls,
            uncovered_exposure=uncovered_exposure,
            active_threat_exposure=active_threat_exposure,
            critical_active_exposure=controlled_active_exposure,
            resolved_exposure=resolved_exposure,
            currency=currency,
            currency_symbol=currency_symbol,
        ),
        kpi_cards=kpi_cards,
        waterfall_data=waterfall_data,
        ai_summary=ai_summary,
        evidence_drill_down=evidence_drill_down,
        last_updated=now.isoformat(),
        report_period=report_period,
        outcome_summary=outcome_summary,
    )
    return response


async def get_or_compute_executive_dashboard(
    current_user: dict,
    period_days: int = 30,
) -> ExecutiveDashboardResponse:
    """Return materialized executive dashboard snapshot (refresh on miss)."""
    from services.executive_dashboard_materializer import (
        get_or_compute_executive_dashboard as _materialized,
    )

    return await _materialized(current_user, period_days)
