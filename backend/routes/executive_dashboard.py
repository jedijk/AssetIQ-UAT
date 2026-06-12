"""
Executive Dashboard - Reliability Value Management
Provides executives with visibility into production value exposure and reliability controls.

NOTE: In AssetIQ, "threats" are called "observations" - this is the primary data source.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any, List, Set
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import asyncio
import logging
from database import db, installation_filter
from auth import get_current_user, require_permission
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, prepend_tenant_match
from services.cache_service import cache
from services.production_exposure import (
    calculate_total_equipment_lifecycle_exposure,
    calculate_covered_assessed_exposure,
    calculate_uncovered_assessed_exposure,
    equipment_assessed_exposure_value,
    production_exposure_monetary_value,
    production_impact_from_criticality,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/executive-dashboard", tags=["Executive Dashboard"])

_dashboard_read = require_permission("observations:read")
HIGH_ACTIVE_RISK_THRESHOLD = 50

OPEN_OBSERVATION_STATUSES = {
    "open", "new", "in_progress", "planning", "active", "investigating",
    "observation", "assessment", "investigation", "action",
}
CLOSED_OBSERVATION_STATUSES = {
    "closed", "resolved", "completed", "done", "dismissed",
    "learning", "mitigated", "archived", "cancelled",
}


def is_open_observation_status(status: Optional[str]) -> bool:
    normalized = (status or "").lower().strip()
    if not normalized:
        return True
    if normalized in CLOSED_OBSERVATION_STATUSES:
        return False
    if normalized in OPEN_OBSERVATION_STATUSES:
        return True
    return True


async def _fetch_scoped_equipment_nodes(current_user: dict) -> List[dict]:
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    if not installation_ids:
        return []
    equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
        installation_ids, current_user["id"]
    )
    if not equipment_ids:
        return []
    return await db.equipment_nodes.find(
        merge_tenant_filter({"id": {"$in": list(equipment_ids)}}, current_user),
        {"_id": 0, "id": 1, "name": 1, "criticality": 1, "equipment_type_id": 1},
    ).to_list(5000)


async def _fetch_scoped_observations(current_user: dict) -> List[dict]:
    """Observations live in the threats collection, scoped by installation access."""
    user_id = current_user["id"]
    installation_ids = await installation_filter.get_user_installation_ids(current_user)
    if not installation_ids:
        return []

    equipment_ids, equipment_names = await asyncio.gather(
        installation_filter.get_all_equipment_ids_for_installations(
            installation_ids, user_id
        ),
        installation_filter.get_equipment_names_for_installations(
            installation_ids, user_id
        ),
    )
    query = installation_filter.build_threat_filter(
        user_id, equipment_ids, equipment_names
    )
    if query.get("_impossible"):
        return []

    return await db.threats.find(
        merge_tenant_filter(query, current_user),
        {
            "_id": 0,
            "id": 1,
            "linked_equipment_id": 1,
            "asset": 1,
            "failure_mode": 1,
            "failure_mode_id": 1,
            "description": 1,
            "user_context": 1,
            "risk_level": 1,
            "risk_score": 1,
            "status": 1,
            "created_at": 1,
        },
    ).to_list(10000)


async def _threat_ids_with_linked_actions(current_user: dict) -> Set[str]:
    rows = await db.central_actions.find(
        merge_tenant_filter(
            {"source_type": "threat", "source_id": {"$exists": True, "$ne": None}},
            current_user,
        ),
        {"_id": 0, "source_id": 1},
    ).to_list(10000)
    return {row["source_id"] for row in rows if row.get("source_id")}

# Equipment with accepted/imported PM Import tasks (Intelligence Map parity).
PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH = {
    "tasks_extracted.equipment_match.equipment_id": {"$ne": None},
    "tasks_extracted.review_status": {"$ne": "rejected"},
    "$or": [
        {"tasks_extracted.import_status": {"$in": ["applied", "merged", "implemented"]}},
        {"tasks_extracted.review_status": {"$in": ["accepted", "edited", "implemented"]}},
    ],
}


async def _equipment_ids_with_active_pm_import(
    current_user: dict,
    *,
    created_before: Optional[str] = None,
) -> set:
    """Equipment covered by an imported PM plan (even without a strategy-based v2 program)."""
    pre_stages: List[dict] = []
    if created_before:
        pre_stages.append({"$match": {"created_at": {"$lt": created_before}}})

    pipeline = prepend_tenant_match(
        [
            *pre_stages,
            {"$unwind": "$tasks_extracted"},
            {"$match": PM_IMPORT_EQUIPMENT_LINKED_TASK_MATCH},
            {"$group": {"_id": "$tasks_extracted.equipment_match.equipment_id"}},
        ],
        current_user,
    )
    rows = await db.pm_import_sessions.aggregate(pipeline).to_list(5000)
    return {row["_id"] for row in rows if row.get("_id")}


class ExposureMetrics(BaseModel):
    """Exposure metrics for the executive dashboard"""
    total_lifecycle_exposure: float
    covered_by_controls: float
    uncovered_exposure: float
    active_threat_exposure: float
    critical_active_exposure: float
    currency: str = "EUR"
    currency_symbol: str = "€"


class KPICard(BaseModel):
    """KPI card with trend indicator"""
    value: float
    formatted_value: str
    previous_value: Optional[float] = None
    change_percent: Optional[float] = None
    trend: Optional[str] = None  # "improving", "degrading", "stable"
    tooltip: str
    evidence_count: int = 0
    total_submitted_count: Optional[int] = None
    week_submitted_count: Optional[int] = None
    previous_formatted: Optional[str] = None
    report_period_label: Optional[str] = None
    previous_period_label: Optional[str] = None


class ExecutiveDashboardResponse(BaseModel):
    """Complete executive dashboard response"""
    exposure_metrics: ExposureMetrics
    kpi_cards: Dict[str, KPICard]
    waterfall_data: List[Dict[str, Any]]
    ai_summary: str
    evidence_drill_down: Dict[str, List[Dict[str, Any]]]
    last_updated: str
    report_period: Dict[str, Any]


def severity_to_production_impact(severity: str) -> int:
    """Convert observation severity to production impact score (1-5)"""
    severity_map = {
        "critical": 5,
        "high": 4,
        "medium": 3,
        "low": 2,
        "minimal": 1,
        "none": 1
    }
    return severity_map.get((severity or "").lower(), 3)


def calculate_production_value(production_impact: int, hourly_cost: float) -> float:
    """Convert production impact score (1-5) to monetary value (workspace-aligned)."""
    return production_exposure_monetary_value(production_impact, hourly_cost)


def format_currency(value: float, symbol: str) -> str:
    """Format currency value for display"""
    if value >= 1_000_000_000:
        return f"{symbol}{value/1_000_000_000:.1f}B"
    elif value >= 1_000_000:
        return f"{symbol}{value/1_000_000:.1f}M"
    elif value >= 1_000:
        return f"{symbol}{value/1_000:.0f}K"
    else:
        return f"{symbol}{value:,.0f}"


def calculate_trend(current: float, previous: float, higher_is_better: bool = False) -> tuple:
    """Calculate trend and percentage change"""
    if previous == 0:
        if current == 0:
            return 0, "stable"
        return 100 if current > 0 else -100, "degrading" if not higher_is_better else "improving"
    
    change_percent = ((current - previous) / previous) * 100
    
    if abs(change_percent) < 2:
        return round(change_percent, 1), "stable"
    
    if higher_is_better:
        return round(change_percent, 1), "improving" if change_percent > 0 else "degrading"
    else:
        return round(change_percent, 1), "degrading" if change_percent > 0 else "improving"


def _datetime_range_query(field: str, start: datetime, end: datetime) -> dict:
    """Match a field stored as BSON datetime or ISO string."""
    start_iso = start.isoformat()
    end_iso = end.isoformat()
    return {
        "$or": [
            {field: {"$gte": start, "$lt": end}},
            {field: {"$gte": start_iso, "$lt": end_iso}},
        ]
    }


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


@router.get("")
async def get_executive_dashboard(
    period_days: int = 30,
    current_user: dict = Depends(_dashboard_read)
) -> ExecutiveDashboardResponse:
    """
    Get executive dashboard data including:
    - Total lifecycle exposure from equipment production criticality assessments
    - Observation-based waterfall metrics (covered, active, critical)
    - KPI cards with trends
    - Drill-down evidence data
    - AI executive summary
    """
    user_id = current_user["id"]
    
    # Get user's production loss configuration
    hourly_cost = 500.0  # Default EUR/hour
    currency = "EUR"
    currency_symbol = "€"
    
    try:
        user_prefs = await db.user_preferences.find_one({"user_id": user_id})
        if user_prefs and user_prefs.get("production_loss_config"):
            config = user_prefs["production_loss_config"]
            hourly_cost = config.get("hourly_cost", 500.0)
            currency = config.get("currency", "EUR")
            currency_symbols = {"EUR": "€", "USD": "$", "GBP": "£", "CHF": "CHF ", "NOK": "kr ", "SEK": "kr ", "DKK": "kr "}
            currency_symbol = currency_symbols.get(currency, "€")
    except Exception as e:
        logger.warning(f"Could not fetch user preferences: {e}")
    
    # Time boundaries for trend calculation
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
    
    # ============= Fetch Data =============

    equipment_nodes, all_observations, threat_ids_with_actions = await asyncio.gather(
        _fetch_scoped_equipment_nodes(current_user),
        _fetch_scoped_observations(current_user),
        _threat_ids_with_linked_actions(current_user),
    )

    def observation_risk_score(obs: dict) -> float:
        raw = obs.get("risk_score")
        if raw is not None and raw != "":
            return float(raw)
        return 0.0
    # Build equipment lookup
    equipment_map = {eq.get("id"): eq for eq in equipment_nodes if eq.get("id")}
    
    # 3. Get maintenance programs (equipment covered by controls)
    program_filter = merge_tenant_filter({}, current_user)
    maintenance_programs = await db.maintenance_programs_v2.find(
        program_filter,
        {
            "_id": 0,
            "equipment_id": 1,
            "equipment_name": 1,
            "equipment_tag": 1,
            "active_tasks": 1,
            "total_tasks": 1,
            "imported_tasks": 1,
            "tasks": 1,
            "created_at": 1,
            "status": 1,
        },
    ).to_list(5000)

    def _program_has_tasks(program: dict) -> bool:
        if (program.get("active_tasks") or 0) > 0:
            return True
        if (program.get("total_tasks") or 0) > 0:
            return True
        if (program.get("imported_tasks") or 0) > 0:
            return True
        return len(program.get("tasks") or []) > 0

    def _program_is_active(program: dict) -> bool:
        status = (program.get("status") or "active").lower()
        return status not in ("archived", "superseded") and _program_has_tasks(program)

    covered_equipment_ids = {
        prog.get("equipment_id")
        for prog in maintenance_programs
        if prog.get("equipment_id") and _program_is_active(prog)
    }
    pm_import_equipment_ids = await _equipment_ids_with_active_pm_import(current_user)
    covered_equipment_ids |= pm_import_equipment_ids
    active_maintenance_program_count = len(covered_equipment_ids)
    previous_period_program_equipment_ids = {
        prog.get("equipment_id")
        for prog in maintenance_programs
        if prog.get("equipment_id")
        and _program_is_active(prog)
        and (prog.get("created_at") or "") < current_period_start.isoformat()
    }
    previous_period_pm_import_ids = await _equipment_ids_with_active_pm_import(
        current_user,
        created_before=current_period_start.isoformat(),
    )
    previous_period_program_equipment_ids |= previous_period_pm_import_ids

    # 4. Get maintenance strategies (for observation control status)
    strategy_filter = merge_tenant_filter({}, current_user)
    strategies = await db.equipment_type_strategies.find(
        strategy_filter,
        {"_id": 0, "equipment_type_id": 1, "status": 1, "failure_mode_strategies": 1}
    ).to_list(500)
    
    # Build set of equipment types and failure modes with active controls
    controlled_equipment_types = set()
    controlled_failure_modes = set()
    for strategy in strategies:
        if strategy.get("status") == "active":
            controlled_equipment_types.add(strategy.get("equipment_type_id"))
        fm_strategies = strategy.get("failure_mode_strategies") or []
        for fms in fm_strategies:
            if fms.get("tasks") or fms.get("pm_tasks") or fms.get("inspection_tasks"):
                controlled_failure_modes.add(fms.get("failure_mode_id"))
    
    # 5. Get Equipment Failure Modes (EFMs) for additional control info
    efm_filter = merge_tenant_filter({}, current_user)
    efms = await db.equipment_failure_modes.find(
        efm_filter,
        {"_id": 0, "id": 1, "equipment_id": 1, "failure_mode_id": 1, "has_strategy": 1}
    ).to_list(5000)
    
    # Build EFM control lookup
    efm_with_strategy = set()
    for efm in efms:
        if efm.get("has_strategy"):
            efm_with_strategy.add(efm.get("id"))
            efm_with_strategy.add(f"{efm.get('equipment_id')}_{efm.get('failure_mode_id')}")
    
    # 6. Scheduled tasks (PM compliance)
    task_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    
    current_tasks = await db.scheduled_tasks.find({
        **task_filter,
        "scheduled_date": {"$gte": current_period_start.isoformat(), "$lte": now.isoformat()}
    }).to_list(5000)
    
    previous_tasks = await db.scheduled_tasks.find({
        **task_filter,
        "scheduled_date": {"$gte": previous_period_start.isoformat(), "$lt": current_period_start.isoformat()}
    }).to_list(5000)
    
    # ============= Calculate Exposure Metrics =============

    total_lifecycle_exposure, assessed_equipment_count = calculate_total_equipment_lifecycle_exposure(
        equipment_nodes,
        hourly_cost,
    )

    covered_by_controls, covered_equipment_count = calculate_covered_assessed_exposure(
        equipment_nodes,
        covered_equipment_ids,
        hourly_cost,
    )
    uncovered_exposure, uncovered_equipment_count = calculate_uncovered_assessed_exposure(
        equipment_nodes,
        covered_equipment_ids,
        hourly_cost,
    )
    prev_covered, _ = calculate_covered_assessed_exposure(
        equipment_nodes,
        previous_period_program_equipment_ids,
        hourly_cost,
    )

    active_threat_exposure = 0.0
    critical_active_exposure = 0.0

    # Previous period metrics for trend
    prev_active_threat = 0.0
    prev_critical = 0.0
    
    # Evidence drill-down data
    uncovered_evidence = []
    for equipment in equipment_nodes:
        equipment_id = equipment.get("id")
        if not equipment_id or equipment_id in covered_equipment_ids:
            continue
        exposure_value = equipment_assessed_exposure_value(equipment, hourly_cost)
        if exposure_value <= 0:
            continue
        production_impact = production_impact_from_criticality(equipment.get("criticality")) or 0
        uncovered_evidence.append({
            "asset": equipment.get("name") or equipment_id,
            "failure_mode": "No Maintenance Program",
            "description": "Assessed equipment without an active maintenance program",
            "equipment_type": equipment.get("equipment_type_id"),
            "production_impact": production_impact,
            "exposure_value": exposure_value,
            "exposure_formatted": format_currency(exposure_value, currency_symbol),
            "control_status": "No Maintenance Program",
            "id": equipment_id,
        })

    active_threat_evidence = []
    critical_evidence = []
    
    # Process each observation (threat) for exposure calculation
    for obs in all_observations:
        equipment_id = obs.get("linked_equipment_id")
        equipment = equipment_map.get(equipment_id) if equipment_id else None
        
        # Priority: Equipment criticality > observation risk level
        production_impact = 3
        if equipment and equipment.get("criticality"):
            production_impact = production_impact_from_criticality(equipment.get("criticality")) or 3
        else:
            production_impact = severity_to_production_impact(obs.get("risk_level"))
        
        exposure_value = calculate_production_value(production_impact, hourly_cost)
        
        created_at = obs.get("created_at", "")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        is_previous_period = (
            created_at >= previous_period_start.isoformat() and 
            created_at < current_period_start.isoformat()
        ) if created_at else False
        
        failure_mode_id = obs.get("failure_mode_id")
        equipment_type_id = equipment.get("equipment_type_id") if equipment else None
        obs_id = obs.get("id")
        
        has_control = (
            equipment_type_id in controlled_equipment_types or
            failure_mode_id in controlled_failure_modes or
            f"{equipment_id}_{failure_mode_id}" in efm_with_strategy or
            obs_id in threat_ids_with_actions
        )
        
        status = obs.get("status") or ""
        is_open = is_open_observation_status(status)
        
        description = obs.get("user_context") or obs.get("description") or ""
        observation_data = {
            "asset": obs.get("asset") or equipment.get("name") if equipment else "Unassigned",
            "failure_mode": obs.get("failure_mode") or description[:50],
            "description": description[:100],
            "equipment_type": equipment_type_id,
            "production_impact": production_impact,
            "severity": obs.get("risk_level"),
            "risk_score": observation_risk_score(obs),
            "exposure_value": exposure_value,
            "exposure_formatted": format_currency(exposure_value, currency_symbol),
            "status": status,
            "source": "threat",
            "id": obs_id,
            "has_actions": obs_id in threat_ids_with_actions,
        }

        active_threat_exposure += exposure_value
        if created_at and created_at < current_period_start.isoformat():
            prev_active_threat += exposure_value

        active_threat_evidence.append({
            **observation_data,
            "control_status": "Controlled" if has_control else "No Control"
        })
        
        if is_open and observation_data["risk_score"] >= HIGH_ACTIVE_RISK_THRESHOLD:
            critical_active_exposure += exposure_value
            if is_previous_period:
                prev_critical += exposure_value
            
            critical_evidence.append({
                **observation_data,
                "control_status": f"Risk score {int(observation_data['risk_score'])}",
                "priority": "Critical" if observation_data["risk_score"] >= 75 else "High"
            })
    
    # ============= Calculate KPIs =============
    
    # 1. Exposure coverage (value covered by active maintenance programs)
    coverage_current = (covered_by_controls / total_lifecycle_exposure * 100) if total_lifecycle_exposure > 0 else 0
    coverage_change, coverage_trend = calculate_trend(covered_by_controls, prev_covered, higher_is_better=True)
    
    # 2. PM Compliance %
    current_completed = len([t for t in current_tasks if t.get("status") == "completed"])
    current_total = len(current_tasks) if current_tasks else 0
    pm_compliance_current = (current_completed / current_total * 100) if current_total > 0 else 0
    
    previous_completed = len([t for t in previous_tasks if t.get("status") == "completed"])
    previous_total = len(previous_tasks) if previous_tasks else 0
    pm_compliance_previous = (previous_completed / previous_total * 100) if previous_total > 0 else pm_compliance_current
    
    pm_change, pm_trend = calculate_trend(pm_compliance_current, pm_compliance_previous, higher_is_better=True)
    
    # 3. Digital execution — tasks/forms submitted in report period vs previous period
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
    
    # 4. Active Threat Exposure trend
    active_change, active_trend = calculate_trend(active_threat_exposure, prev_active_threat, higher_is_better=False)
    
    # 5. High exposure trend
    critical_change, critical_trend = calculate_trend(critical_active_exposure, prev_critical, higher_is_better=False)
    
    # ============= Build KPI Cards =============
    
    total_obs = len(all_observations)
    
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
                f"({coverage_current:.0f}% of total assessed exposure)."
            ),
            evidence_count=active_maintenance_program_count,
        ),
        "active_threat_exposure": KPICard(
            value=active_threat_exposure,
            formatted_value=format_currency(active_threat_exposure, currency_symbol),
            previous_value=prev_active_threat,
            change_percent=active_change,
            trend=active_trend,
            tooltip="Total production impact across all observations.",
            evidence_count=total_obs
        ),
        "critical_active_exposure": KPICard(
            value=critical_active_exposure,
            formatted_value=format_currency(critical_active_exposure, currency_symbol),
            previous_value=prev_critical,
            change_percent=critical_change,
            trend=critical_trend,
            tooltip=(
                "Production impact from active observations with a risk score of "
                f"{HIGH_ACTIVE_RISK_THRESHOLD} or above."
            ),
            evidence_count=len(critical_evidence)
        ),
        "pm_compliance": KPICard(
            value=round(pm_compliance_current, 1),
            formatted_value=f"{pm_compliance_current:.0f}%",
            previous_value=round(pm_compliance_previous, 1),
            change_percent=pm_change,
            trend=pm_trend,
            tooltip="Percentage of planned preventive maintenance activities completed within the reporting period.",
            evidence_count=current_completed
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
        )
    }
    
    # ============= Build Waterfall Data =============
    
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
            "name": "Active Exposure",
            "value": active_threat_exposure,
            "formatted": format_currency(active_threat_exposure, currency_symbol),
            "type": "warning",
            "color": "#f97316",
            "count": total_obs,
            "count_unit": "observations",
        },
        {
            "name": "High Exposure",
            "value": critical_active_exposure,
            "formatted": format_currency(critical_active_exposure, currency_symbol),
            "type": "critical",
            "color": "#ef4444",
            "count": len(critical_evidence),
            "count_unit": "observations",
        }
    ]
    
    # ============= Generate AI Summary =============
    
    ai_summary = f"""AssetIQ is tracking {total_obs} identified reliability observations against {assessed_equipment_count} equipment assets with assessed production criticality, representing a total assessed exposure of {format_currency(total_lifecycle_exposure, currency_symbol)}.

{format_currency(covered_by_controls, currency_symbol)} ({coverage_current:.0f}%) of assessed exposure is covered by equipment with a maintenance program or imported PM plan. {format_currency(uncovered_exposure, currency_symbol)} remains uncovered across {uncovered_equipment_count} assessed assets without active controls.

All {total_obs} observations represent {format_currency(active_threat_exposure, currency_symbol)} in total production exposure. {len(critical_evidence)} active observations with a risk score of {HIGH_ACTIVE_RISK_THRESHOLD} or above represent {format_currency(critical_active_exposure, currency_symbol)} and require immediate attention.

PM compliance {"is strong" if pm_compliance_current >= 85 else "needs improvement"} at {pm_compliance_current:.0f}%. Digital execution recorded {digital_current_period} tasks and forms in the report period ({report_period['label']}) versus {digital_previous_period} in the previous period."""
    
    # ============= Evidence Drill-Down =============
    
    evidence_drill_down = {
        "uncovered_exposure": sorted(uncovered_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:25],
        "active_threat_exposure": sorted(active_threat_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:25],
        "critical_active_exposure": sorted(critical_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:25]
    }
    
    return ExecutiveDashboardResponse(
        exposure_metrics=ExposureMetrics(
            total_lifecycle_exposure=total_lifecycle_exposure,
            covered_by_controls=covered_by_controls,
            uncovered_exposure=uncovered_exposure,
            active_threat_exposure=active_threat_exposure,
            critical_active_exposure=critical_active_exposure,
            currency=currency,
            currency_symbol=currency_symbol
        ),
        kpi_cards=kpi_cards,
        waterfall_data=waterfall_data,
        ai_summary=ai_summary,
        evidence_drill_down=evidence_drill_down,
        last_updated=now.isoformat(),
        report_period=report_period,
    )


@router.get("/evidence/{metric_type}")
async def get_evidence_detail(
    metric_type: str,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(_dashboard_read)
) -> Dict[str, Any]:
    """
    Get detailed evidence for a specific metric.
    metric_type: uncovered_exposure, active_threat_exposure, critical_active_exposure
    """
    dashboard = await get_executive_dashboard(current_user=current_user)
    
    if metric_type not in dashboard.evidence_drill_down:
        raise HTTPException(status_code=400, detail=f"Invalid metric type: {metric_type}")
    
    evidence = dashboard.evidence_drill_down.get(metric_type, [])
    
    return {
        "metric_type": metric_type,
        "total": len(evidence),
        "items": evidence[skip:skip+limit]
    }
