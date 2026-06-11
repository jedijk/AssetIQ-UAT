"""
Executive Dashboard - Reliability Value Management
Provides executives with visibility into production value exposure and reliability controls.

NOTE: In AssetIQ, "threats" are called "observations" - this is the primary data source.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import logging
from database import db
from auth import get_current_user, require_permission
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user
from services.cache_service import cache
from services.production_exposure import (
    calculate_total_equipment_lifecycle_exposure,
    production_exposure_monetary_value,
    production_impact_from_criticality,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/executive-dashboard", tags=["Executive Dashboard"])

_dashboard_read = require_permission("observations:read")


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


class ExecutiveDashboardResponse(BaseModel):
    """Complete executive dashboard response"""
    exposure_metrics: ExposureMetrics
    kpi_cards: Dict[str, KPICard]
    waterfall_data: List[Dict[str, Any]]
    ai_summary: str
    evidence_drill_down: Dict[str, List[Dict[str, Any]]]
    last_updated: str


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
    
    # ============= Fetch Data =============
    
    # 1. Get all OBSERVATIONS (these are the threats in AssetIQ)
    obs_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    all_observations = await db.observations.find(
        obs_filter,
        {
            "_id": 0, "id": 1, "equipment_id": 1, "equipment_name": 1,
            "failure_mode_id": 1, "failure_mode_name": 1, "description": 1,
            "severity": 1, "status": 1, "observation_type": 1, "source": 1,
            "linked_action_ids": 1, "efm_id": 1,
            "created_at": 1, "updated_at": 1, "created_by": 1
        }
    ).to_list(10000)
    
    # 2. Get equipment nodes with criticality data
    equipment_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    equipment_nodes = await db.equipment_nodes.find(
        equipment_filter,
        {"_id": 0, "id": 1, "name": 1, "criticality": 1, "equipment_type_id": 1}
    ).to_list(5000)
    
    # Build equipment lookup
    equipment_map = {eq.get("id"): eq for eq in equipment_nodes if eq.get("id")}
    
    # 3. Get maintenance strategies (controls)
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
    
    # 4. Get Equipment Failure Modes (EFMs) for additional control info
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
    
    # 5. Scheduled tasks (PM compliance)
    task_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    
    current_tasks = await db.scheduled_tasks.find({
        **task_filter,
        "scheduled_date": {"$gte": current_period_start.isoformat(), "$lte": now.isoformat()}
    }).to_list(5000)
    
    previous_tasks = await db.scheduled_tasks.find({
        **task_filter,
        "scheduled_date": {"$gte": previous_period_start.isoformat(), "$lt": current_period_start.isoformat()}
    }).to_list(5000)
    
    # 6. Form submissions (digital execution)
    forms_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    
    current_submissions = await db.form_submissions.find({
        **forms_filter,
        "created_at": {"$gte": current_period_start.isoformat()}
    }).to_list(5000)
    
    previous_submissions = await db.form_submissions.find({
        **forms_filter,
        "created_at": {"$gte": previous_period_start.isoformat(), "$lt": current_period_start.isoformat()}
    }).to_list(5000)
    
    # ============= Calculate Exposure Metrics =============

    total_lifecycle_exposure, assessed_equipment_count = calculate_total_equipment_lifecycle_exposure(
        equipment_nodes,
        hourly_cost,
    )

    covered_by_controls = 0.0
    uncovered_exposure = 0.0
    active_threat_exposure = 0.0
    critical_active_exposure = 0.0

    # Previous period metrics for trend
    prev_covered = 0.0
    prev_active_threat = 0.0
    prev_critical = 0.0
    
    # Evidence drill-down data
    uncovered_evidence = []
    active_threat_evidence = []
    critical_evidence = []
    
    # Open statuses
    open_statuses = {"open", "new", "in_progress", "planning", "active", "investigating"}
    closed_statuses = {"closed", "resolved", "completed", "done", "dismissed"}
    
    # Process each OBSERVATION for exposure calculation
    for obs in all_observations:
        # Get production impact from equipment criticality or observation severity
        equipment_id = obs.get("equipment_id")
        equipment = equipment_map.get(equipment_id) if equipment_id else None
        
        # Priority: Equipment criticality > Observation severity
        production_impact = 3  # Default medium
        if equipment and equipment.get("criticality"):
            production_impact = production_impact_from_criticality(equipment.get("criticality")) or 3
        else:
            # Fall back to observation severity
            production_impact = severity_to_production_impact(obs.get("severity"))
        
        # Calculate monetary exposure (same max-hours logic as observation workspace)
        exposure_value = calculate_production_value(production_impact, hourly_cost)
        
        # Determine if created in current or previous period
        created_at = obs.get("created_at", "")
        is_previous_period = (
            created_at >= previous_period_start.isoformat() and 
            created_at < current_period_start.isoformat()
        ) if created_at else False
        
        # Check if has control
        failure_mode_id = obs.get("failure_mode_id")
        efm_id = obs.get("efm_id")
        equipment_type_id = equipment.get("equipment_type_id") if equipment else None
        
        has_control = (
            equipment_type_id in controlled_equipment_types or
            failure_mode_id in controlled_failure_modes or
            efm_id in efm_with_strategy or
            f"{equipment_id}_{failure_mode_id}" in efm_with_strategy or
            bool(obs.get("linked_action_ids"))  # Has linked remediation actions
        )
        
        # Check if observation is open/active
        status = (obs.get("status") or "").lower()
        is_open = status in open_statuses or (status and status not in closed_statuses)
        
        observation_data = {
            "asset": obs.get("equipment_name") or "Unassigned",
            "failure_mode": obs.get("failure_mode_name") or obs.get("description", "")[:50],
            "description": obs.get("description", "")[:100],
            "equipment_type": equipment_type_id,
            "production_impact": production_impact,
            "severity": obs.get("severity"),
            "exposure_value": exposure_value,
            "exposure_formatted": format_currency(exposure_value, currency_symbol),
            "status": obs.get("status"),
            "source": obs.get("source"),
            "id": obs.get("id"),
            "has_actions": bool(obs.get("linked_action_ids"))
        }
        
        if has_control:
            covered_by_controls += exposure_value
            if is_previous_period:
                prev_covered += exposure_value
        else:
            uncovered_exposure += exposure_value
            uncovered_evidence.append({
                **observation_data,
                "control_status": "No Control Strategy"
            })
        
        if is_open:
            active_threat_exposure += exposure_value
            if is_previous_period:
                prev_active_threat += exposure_value
            
            active_threat_evidence.append({
                **observation_data,
                "control_status": "Controlled" if has_control else "No Control"
            })
            
            if not has_control:
                critical_active_exposure += exposure_value
                if is_previous_period:
                    prev_critical += exposure_value
                
                critical_evidence.append({
                    **observation_data,
                    "control_status": "No Active Control",
                    "priority": "Critical" if obs.get("severity", "").lower() in ["high", "critical"] else "High"
                })
    
    # ============= Calculate KPIs =============
    
    # 1. Exposure Coverage %
    coverage_current = (covered_by_controls / total_lifecycle_exposure * 100) if total_lifecycle_exposure > 0 else 0
    coverage_previous = (prev_covered / total_lifecycle_exposure * 100) if total_lifecycle_exposure > 0 else coverage_current
    coverage_change, coverage_trend = calculate_trend(coverage_current, coverage_previous, higher_is_better=True)
    
    # 2. PM Compliance %
    current_completed = len([t for t in current_tasks if t.get("status") == "completed"])
    current_total = len(current_tasks) if current_tasks else 0
    pm_compliance_current = (current_completed / current_total * 100) if current_total > 0 else 0
    
    previous_completed = len([t for t in previous_tasks if t.get("status") == "completed"])
    previous_total = len(previous_tasks) if previous_tasks else 0
    pm_compliance_previous = (previous_completed / previous_total * 100) if previous_total > 0 else pm_compliance_current
    
    pm_change, pm_trend = calculate_trend(pm_compliance_current, pm_compliance_previous, higher_is_better=True)
    
    # 3. Digital Execution Rate %
    current_digital = len(current_submissions)
    previous_digital = len(previous_submissions)
    
    # Calculate execution rate based on expected submissions
    forms_count = await db.forms.count_documents(merge_tenant_filter({"status": "active"}, current_user))
    expected_submissions = max(forms_count * period_days // 7, 1)  # At least 1 per week per form
    digital_execution_pct = min((current_digital / expected_submissions * 100), 100) if expected_submissions > 0 else 0
    prev_digital_pct = min((previous_digital / expected_submissions * 100), 100) if expected_submissions > 0 else 0
    
    digital_change, digital_trend = calculate_trend(digital_execution_pct, prev_digital_pct, higher_is_better=True)
    
    # 4. Active Threat Exposure trend
    active_change, active_trend = calculate_trend(active_threat_exposure, prev_active_threat, higher_is_better=False)
    
    # 5. Critical Active Exposure trend
    critical_change, critical_trend = calculate_trend(critical_active_exposure, prev_critical, higher_is_better=False)
    
    # ============= Build KPI Cards =============
    
    open_obs_count = len([o for o in all_observations if (o.get("status") or "").lower() in open_statuses or (o.get("status") or "").lower() not in closed_statuses])
    
    kpi_cards = {
        "exposure_coverage": KPICard(
            value=round(coverage_current, 1),
            formatted_value=f"{coverage_current:.0f}%",
            previous_value=round(coverage_previous, 1),
            change_percent=coverage_change,
            trend=coverage_trend,
            tooltip="Percentage of identified lifecycle exposure currently covered by a reliability control strategy.",
            evidence_count=len([s for s in strategies if s.get("status") == "active"])
        ),
        "active_threat_exposure": KPICard(
            value=active_threat_exposure,
            formatted_value=format_currency(active_threat_exposure, currency_symbol),
            previous_value=prev_active_threat,
            change_percent=active_change,
            trend=active_trend,
            tooltip="Production impact currently associated with active observations, findings, investigations, or alerts.",
            evidence_count=open_obs_count
        ),
        "critical_active_exposure": KPICard(
            value=critical_active_exposure,
            formatted_value=format_currency(critical_active_exposure, currency_symbol),
            previous_value=prev_critical,
            change_percent=critical_change,
            trend=critical_trend,
            tooltip="Production impact associated with active evidence and no control strategy. Requires immediate attention.",
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
            value=round(digital_execution_pct, 1),
            formatted_value=f"{digital_execution_pct:.0f}%",
            previous_value=round(prev_digital_pct, 1),
            change_percent=digital_change,
            trend=digital_trend,
            tooltip="Percentage of reliability activities successfully executed through AssetIQ digital workflows.",
            evidence_count=current_digital
        )
    }
    
    # ============= Build Waterfall Data =============
    
    waterfall_data = [
        {
            "name": "Total Lifecycle Exposure",
            "value": total_lifecycle_exposure,
            "formatted": format_currency(total_lifecycle_exposure, currency_symbol),
            "type": "total",
            "color": "#64748b"
        },
        {
            "name": "Covered by Controls",
            "value": covered_by_controls,
            "formatted": format_currency(covered_by_controls, currency_symbol),
            "type": "positive",
            "color": "#22c55e"
        },
        {
            "name": "Uncovered Exposure",
            "value": uncovered_exposure,
            "formatted": format_currency(uncovered_exposure, currency_symbol),
            "type": "negative",
            "color": "#f59e0b"
        },
        {
            "name": "Active Threat Exposure",
            "value": active_threat_exposure,
            "formatted": format_currency(active_threat_exposure, currency_symbol),
            "type": "warning",
            "color": "#f97316"
        },
        {
            "name": "Critical Active Exposure",
            "value": critical_active_exposure,
            "formatted": format_currency(critical_active_exposure, currency_symbol),
            "type": "critical",
            "color": "#ef4444"
        }
    ]
    
    # ============= Generate AI Summary =============
    
    total_obs = len(all_observations)
    
    ai_summary = f"""AssetIQ is tracking {total_obs} identified reliability observations against {assessed_equipment_count} equipment assets with assessed production criticality, representing a total lifecycle exposure of {format_currency(total_lifecycle_exposure, currency_symbol)}.

{format_currency(covered_by_controls, currency_symbol)} ({coverage_current:.0f}%) of this exposure is covered by active reliability control strategies.

Currently, {open_obs_count} observations representing {format_currency(active_threat_exposure, currency_symbol)} are showing active status. Of these, {format_currency(critical_active_exposure, currency_symbol)} has no active control strategy and requires immediate attention.

PM compliance {"is strong" if pm_compliance_current >= 85 else "needs improvement"} at {pm_compliance_current:.0f}%, with {current_digital} digital workflow executions recorded this period."""
    
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
        last_updated=now.isoformat()
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
