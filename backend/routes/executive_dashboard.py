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
HIGH_EXPOSURE_RISK_LEVELS = {"high", "critical"}

# Terminal journey stages excluded from active/high exposure (matches Observations page default filter).
TERMINAL_OBSERVATION_STATUSES = {
    "mitigated", "learning", "closed", "resolved", "completed",
    "done", "dismissed", "archived", "cancelled",
}


def is_active_observation_status(status: Optional[str]) -> bool:
    """Non-terminal observations — aligned with Observations page default status filter."""
    normalized = (status or "").lower().strip()
    if not normalized:
        return True
    return normalized not in TERMINAL_OBSERVATION_STATUSES


def observation_risk_score_value(obs: dict) -> float:
    raw = obs.get("risk_score")
    if raw is None or raw == "":
        return 0.0
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def is_high_exposure_observation(obs: dict) -> bool:
    """High exposure = active observation with High/Critical risk (score or level)."""
    if observation_risk_score_value(obs) >= HIGH_ACTIVE_RISK_THRESHOLD:
        return True
    return (obs.get("risk_level") or "").lower().strip() in HIGH_EXPOSURE_RISK_LEVELS


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
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "tag": 1,
            "level": 1,
            "criticality": 1,
            "equipment_type_id": 1,
        },
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
            "title": 1,
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


ASSESSMENT_COVERAGE_LEVELS = frozenset({"subunit", "maintainable_item"})


def _equipment_level_key(level: Optional[str]) -> str:
    return (level or "").lower().strip()


def _is_equipment_production_assessed(equipment: dict) -> bool:
    return production_impact_from_criticality(equipment.get("criticality")) > 0


def _assessment_level_display(level: str) -> str:
    labels = {
        "subunit": "Sub unit",
        "maintainable_item": "Maintainable item",
    }
    return labels.get(level, level.replace("_", " ").title())


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
        return observation_risk_score_value(obs)
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
    prev_uncovered, _ = calculate_uncovered_assessed_exposure(
        equipment_nodes,
        previous_period_program_equipment_ids,
        hourly_cost,
    )

    active_threat_exposure = 0.0
    controlled_active_exposure = 0.0

    # Previous period metrics for trend
    prev_active_threat = 0.0
    prev_controlled_active = 0.0
    
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
            "criticality": equipment.get("criticality"),
            "production_impact": production_impact,
            "exposure_value": exposure_value,
            "exposure_formatted": format_currency(exposure_value, currency_symbol),
            "control_status": "No Maintenance Program",
            "id": equipment_id,
        })

    assessment_scope_equipment = [
        eq
        for eq in equipment_nodes
        if _equipment_level_key(eq.get("level")) in ASSESSMENT_COVERAGE_LEVELS
    ]
    assessed_in_scope_count = sum(
        1 for eq in assessment_scope_equipment if _is_equipment_production_assessed(eq)
    )
    assessment_scope_total = len(assessment_scope_equipment)
    assessment_coverage_pct = (
        (assessed_in_scope_count / assessment_scope_total * 100)
        if assessment_scope_total > 0
        else 0.0
    )
    unassessed_assessment_evidence: List[dict] = []
    for equipment in assessment_scope_equipment:
        if _is_equipment_production_assessed(equipment):
            continue
        equipment_id = equipment.get("id")
        level_key = _equipment_level_key(equipment.get("level"))
        unassessed_assessment_evidence.append(
            {
                "asset": equipment.get("name") or equipment_id,
                "tag": equipment.get("tag"),
                "level": level_key,
                "level_label": _assessment_level_display(level_key),
                "control_status": "Not assessed",
                "exposure_formatted": "—",
                "id": equipment_id,
            }
        )
    unassessed_assessment_count = len(unassessed_assessment_evidence)

    active_threat_evidence = []
    controlled_active_evidence = []
    
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
        is_active = is_active_observation_status(status)
        if not is_active:
            continue
        
        description = obs.get("user_context") or obs.get("description") or ""
        title = (
            obs.get("title")
            or obs.get("failure_mode")
            or (description[:80] if description else "Untitled Observation")
        )
        observation_data = {
            "title": title,
            "asset": obs.get("asset") or equipment.get("name") if equipment else "Unassigned",
            "failure_mode": obs.get("failure_mode") or description[:50],
            "description": description[:100],
            "created_at": created_at,
            "equipment_type": equipment_type_id,
            "production_impact": production_impact,
            "severity": obs.get("risk_level"),
            "risk_score": observation_risk_score(obs),
            "risk_level": obs.get("risk_level"),
            "exposure_value": exposure_value,
            "exposure_formatted": format_currency(exposure_value, currency_symbol),
            "status": status,
            "source": "threat",
            "id": obs_id,
            "has_actions": obs_id in threat_ids_with_actions,
        }

        is_before_current_period = (
            created_at and created_at < current_period_start.isoformat()
        )

        if not has_control:
            active_threat_exposure += exposure_value
            if is_before_current_period:
                prev_active_threat += exposure_value
            active_threat_evidence.append({
                **observation_data,
                "control_status": "No Control",
            })
        else:
            controlled_active_exposure += exposure_value
            if is_before_current_period:
                prev_controlled_active += exposure_value
            controlled_active_evidence.append({
                **observation_data,
                "control_status": "Controlled",
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
    
    # 4. Uncontrolled active exposure trend (lower is better)
    active_change, active_trend = calculate_trend(active_threat_exposure, prev_active_threat, higher_is_better=False)
    
    # 5. Controlled active exposure trend (higher is better)
    controlled_change, controlled_trend = calculate_trend(
        controlled_active_exposure, prev_controlled_active, higher_is_better=True
    )

    # 6. Uncovered exposure trend
    uncovered_change, uncovered_trend = calculate_trend(uncovered_exposure, prev_uncovered, higher_is_better=False)
    
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
        }
    ]
    
    # ============= Generate AI Summary =============
    
    ai_summary = f"""AssetIQ is tracking {total_obs} identified reliability observations against {assessed_equipment_count} equipment assets with assessed production criticality, representing a total assessed exposure of {format_currency(total_lifecycle_exposure, currency_symbol)}.

{format_currency(covered_by_controls, currency_symbol)} ({coverage_current:.0f}%) of assessed exposure is covered by equipment with a maintenance program or imported PM plan. {format_currency(uncovered_exposure, currency_symbol)} remains uncovered across {uncovered_equipment_count} assessed assets without active controls.

Active observations without controls represent {format_currency(active_threat_exposure, currency_symbol)} in uncontrolled production exposure ({len(active_threat_evidence)} observations). {format_currency(controlled_active_exposure, currency_symbol)} of active exposure is controlled across {len(controlled_active_evidence)} observations with a strategy, program, or action plan.

PM compliance {"is strong" if pm_compliance_current >= 85 else "needs improvement"} at {pm_compliance_current:.0f}%. Digital execution recorded {digital_current_period} tasks and forms in the report period ({report_period['label']}) versus {digital_previous_period} in the previous period."""
    
    # ============= Evidence Drill-Down =============
    
    evidence_drill_down = {
        "uncovered_exposure": sorted(uncovered_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:25],
        "unassessed_assessments": sorted(
            unassessed_assessment_evidence,
            key=lambda x: (x.get("level", ""), (x.get("asset") or "").lower()),
        ),
        "active_threat_exposure": sorted(active_threat_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:25],
        "critical_active_exposure": sorted(controlled_active_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:25]
    }
    
    return ExecutiveDashboardResponse(
        exposure_metrics=ExposureMetrics(
            total_lifecycle_exposure=total_lifecycle_exposure,
            covered_by_controls=covered_by_controls,
            uncovered_exposure=uncovered_exposure,
            active_threat_exposure=active_threat_exposure,
            critical_active_exposure=controlled_active_exposure,
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
    metric_type: uncovered_exposure, unassessed_assessments, active_threat_exposure, critical_active_exposure
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
