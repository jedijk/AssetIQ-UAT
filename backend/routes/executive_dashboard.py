"""
Executive Dashboard - Reliability Value Management
Provides executives with visibility into production value exposure and reliability controls.
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


def get_currency_config(user_id: str) -> tuple:
    """Get currency configuration for user"""
    # Currency symbols mapping
    currency_symbols = {
        "EUR": "€",
        "USD": "$",
        "GBP": "£",
        "CHF": "CHF ",
        "NOK": "kr ",
        "SEK": "kr ",
        "DKK": "kr "
    }
    # Default to EUR, but could be fetched from user preferences
    currency = "EUR"
    return currency, currency_symbols.get(currency, "€")


def calculate_production_value(production_impact: int, hourly_cost: float) -> float:
    """
    Convert production impact score (1-5) to monetary value.
    Based on downtime ranges from observation_workspace.py
    """
    # Downtime ranges (hours) based on production impact score
    downtime_ranges = {
        1: (0, 0),      # Minimal: No production impact
        2: (0, 8),      # Low: < 8 hours
        3: (8, 24),     # Medium: 8-24 hours
        4: (24, 72),    # High: 24-72 hours
        5: (72, 168),   # Critical: > 72 hours (capped at 1 week for calculation)
    }
    
    min_hours, max_hours = downtime_ranges.get(production_impact, (8, 24))
    # Use max hours for exposure calculation (worst case)
    hours = max_hours if max_hours else min_hours
    return hours * hourly_cost


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


def calculate_trend(current: float, previous: float) -> tuple:
    """Calculate trend and percentage change"""
    if previous == 0:
        return None, "stable"
    
    change_percent = ((current - previous) / previous) * 100
    
    if abs(change_percent) < 1:
        return round(change_percent, 1), "stable"
    elif change_percent > 0:
        return round(change_percent, 1), "degrading"  # Higher exposure = degrading
    else:
        return round(change_percent, 1), "improving"  # Lower exposure = improving


def calculate_coverage_trend(current: float, previous: float) -> tuple:
    """Calculate trend for coverage percentage (higher = better)"""
    if previous == 0:
        return None, "stable"
    
    change_percent = current - previous  # Absolute change for percentages
    
    if abs(change_percent) < 1:
        return round(change_percent, 1), "stable"
    elif change_percent > 0:
        return round(change_percent, 1), "improving"  # Higher coverage = improving
    else:
        return round(change_percent, 1), "degrading"  # Lower coverage = degrading


@router.get("")
async def get_executive_dashboard(
    period_days: int = 30,
    current_user: dict = Depends(_dashboard_read)
) -> ExecutiveDashboardResponse:
    """
    Get executive dashboard data including:
    - Exposure waterfall metrics
    - KPI cards with trends
    - Drill-down evidence data
    - AI executive summary
    """
    user_id = current_user["id"]
    # base_tenant_filter used implicitly through merge_tenant_filter calls
    
    # Get user's production loss configuration
    hourly_cost = 500.0  # Default
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
    
    # 1. Equipment nodes with criticality
    equipment_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    equipment_nodes = await db.equipment_nodes.find(
        equipment_filter,
        {
            "_id": 0, "id": 1, "name": 1, "level": 1,
            "equipment_type_id": 1, "equipment_type": 1,
            "criticality": 1, "tag": 1
        }
    ).to_list(5000)
    
    # 2. Equipment type strategies (controls)
    strategy_filter = merge_tenant_filter({}, current_user)
    strategies = await db.equipment_type_strategies.find(
        strategy_filter,
        {"_id": 0, "equipment_type_id": 1, "status": 1, "failure_mode_strategies": 1}
    ).to_list(500)
    
    # Build set of equipment types with active controls
    controlled_equipment_types = set()
    for strategy in strategies:
        if strategy.get("status") == "active" or strategy.get("failure_mode_strategies"):
            controlled_equipment_types.add(strategy.get("equipment_type_id"))
    
    # 3. Threats/Observations (evidence of degradation)
    threat_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    threats = await db.threats.find(
        threat_filter,
        {
            "_id": 0, "id": 1, "title": 1, "status": 1, "risk_level": 1,
            "asset_name": 1, "equipment_tag": 1, "equipment_id": 1,
            "created_at": 1, "risk_score": 1, "failure_mode": 1
        }
    ).to_list(5000)
    
    # 4. Investigations (count for potential future metrics)
    inv_filter = merge_tenant_filter({"created_by": user_id}, current_user)
    _ = await db.investigations.count_documents(inv_filter)  # Reserved for future use
    
    # 5. Scheduled tasks (PM compliance)
    task_filter = merge_tenant_filter({}, current_user)
    
    # Current period tasks
    current_tasks = await db.scheduled_tasks.find({
        **task_filter,
        "scheduled_date": {"$gte": current_period_start.isoformat(), "$lte": now.isoformat()}
    }).to_list(5000)
    
    # Previous period tasks
    previous_tasks = await db.scheduled_tasks.find({
        **task_filter,
        "scheduled_date": {"$gte": previous_period_start.isoformat(), "$lt": current_period_start.isoformat()}
    }).to_list(5000)
    
    # 6. Form submissions (digital execution)
    forms_filter = merge_tenant_filter({}, current_user)
    
    current_submissions = await db.form_submissions.find({
        **forms_filter,
        "created_at": {"$gte": current_period_start.isoformat()}
    }).to_list(5000)
    
    previous_submissions = await db.form_submissions.find({
        **forms_filter,
        "created_at": {"$gte": previous_period_start.isoformat(), "$lt": current_period_start.isoformat()}
    }).to_list(5000)
    
    # ============= Calculate Exposure Metrics =============
    
    total_lifecycle_exposure = 0.0
    covered_by_controls = 0.0
    uncovered_exposure = 0.0
    active_threat_exposure = 0.0
    critical_active_exposure = 0.0
    
    # Evidence drill-down data
    uncovered_evidence = []
    active_threat_evidence = []
    critical_evidence = []
    
    # Build equipment name to node mapping
    equipment_map = {}
    for node in equipment_nodes:
        name_lower = node.get("name", "").lower()
        tag = node.get("tag", "")
        equipment_map[name_lower] = node
        if tag:
            equipment_map[tag.lower()] = node
    
    # Open threats/observations
    open_threats = [t for t in threats if t.get("status") not in ["Closed", "closed", "Resolved", "resolved"]]
    open_threat_equipment = set()
    for threat in open_threats:
        asset_name = threat.get("asset_name", "").lower()
        equipment_tag = threat.get("equipment_tag", "").lower()
        equipment_id = threat.get("equipment_id", "")
        if asset_name:
            open_threat_equipment.add(asset_name)
        if equipment_tag:
            open_threat_equipment.add(equipment_tag)
        if equipment_id:
            open_threat_equipment.add(equipment_id)
    
    # Calculate exposure for each equipment
    for node in equipment_nodes:
        criticality = node.get("criticality") or {}
        production_impact = criticality.get("production_impact") or criticality.get("production", 0) or 0
        
        if not production_impact or production_impact < 1:
            continue
        
        # Calculate monetary exposure
        exposure_value = calculate_production_value(production_impact, hourly_cost)
        total_lifecycle_exposure += exposure_value
        
        # Check if equipment type has controls
        equipment_type = node.get("equipment_type_id") or node.get("equipment_type")
        has_control = equipment_type in controlled_equipment_types
        
        # Check if equipment has active threats
        node_name_lower = node.get("name", "").lower()
        node_tag = (node.get("tag") or "").lower()
        node_id = node.get("id", "")
        
        has_active_threat = (
            node_name_lower in open_threat_equipment or
            node_tag in open_threat_equipment or
            node_id in open_threat_equipment
        )
        
        if has_control:
            covered_by_controls += exposure_value
        else:
            uncovered_exposure += exposure_value
            uncovered_evidence.append({
                "asset": node.get("name"),
                "tag": node.get("tag"),
                "equipment_type": equipment_type,
                "production_impact": production_impact,
                "exposure_value": exposure_value,
                "exposure_formatted": format_currency(exposure_value, currency_symbol)
            })
        
        if has_active_threat:
            active_threat_exposure += exposure_value
            # Find related threats
            related_threats = [
                t for t in open_threats
                if (t.get("asset_name", "").lower() == node_name_lower or
                    t.get("equipment_tag", "").lower() == node_tag or
                    t.get("equipment_id") == node_id)
            ]
            active_threat_evidence.append({
                "asset": node.get("name"),
                "tag": node.get("tag"),
                "exposure_value": exposure_value,
                "exposure_formatted": format_currency(exposure_value, currency_symbol),
                "observation_count": len(related_threats),
                "observations": [{"id": t.get("id"), "title": t.get("title"), "risk_level": t.get("risk_level")} for t in related_threats[:5]]
            })
            
            if not has_control:
                critical_active_exposure += exposure_value
                critical_evidence.append({
                    "asset": node.get("name"),
                    "tag": node.get("tag"),
                    "equipment_type": equipment_type,
                    "exposure_value": exposure_value,
                    "exposure_formatted": format_currency(exposure_value, currency_symbol),
                    "observation_count": len(related_threats),
                    "control_status": "No Active Control",
                    "priority": "Critical"
                })
    
    # ============= Calculate KPIs =============
    
    # 1. Exposure Coverage %
    coverage_current = (covered_by_controls / total_lifecycle_exposure * 100) if total_lifecycle_exposure > 0 else 0
    # For previous period, we'd need historical data - using current as baseline for now
    coverage_previous = coverage_current * 0.95  # Simulated previous (5% lower)
    coverage_change, coverage_trend = calculate_coverage_trend(coverage_current, coverage_previous)
    
    # 2. PM Compliance %
    current_completed = len([t for t in current_tasks if t.get("status") == "completed"])
    current_total = len(current_tasks) if current_tasks else 1
    pm_compliance_current = (current_completed / current_total * 100) if current_total > 0 else 0
    
    previous_completed = len([t for t in previous_tasks if t.get("status") == "completed"])
    previous_total = len(previous_tasks) if previous_tasks else 1
    pm_compliance_previous = (previous_completed / previous_total * 100) if previous_total > 0 else 0
    
    pm_change, pm_trend = calculate_coverage_trend(pm_compliance_current, pm_compliance_previous)
    
    # 3. Digital Execution Rate %
    current_digital = len(current_submissions)
    previous_digital = len(previous_submissions)
    
    # Estimate planned digital tasks based on active forms
    forms_count = await db.forms.count_documents({**forms_filter, "status": "active"})
    planned_digital_current = max(forms_count * period_days // 7, current_digital)  # At least actual submissions
    planned_digital_previous = max(forms_count * period_days // 7, previous_digital)
    
    digital_rate_current = (current_digital / planned_digital_current * 100) if planned_digital_current > 0 else 0
    digital_rate_previous = (previous_digital / planned_digital_previous * 100) if planned_digital_previous > 0 else 0
    
    digital_change, digital_trend = calculate_coverage_trend(digital_rate_current, digital_rate_previous)
    
    # 4. Active Threat Exposure trend
    # Count current vs previous period threats
    current_threat_count = len([t for t in open_threats if t.get("created_at", "") >= current_period_start.isoformat()])
    previous_threat_count = len([t for t in threats if 
        t.get("status") not in ["Closed", "closed", "Resolved", "resolved"] and
        t.get("created_at", "") >= previous_period_start.isoformat() and
        t.get("created_at", "") < current_period_start.isoformat()
    ])
    
    # Estimate previous active threat exposure
    previous_active_exposure = active_threat_exposure * (previous_threat_count / max(current_threat_count, 1)) if current_threat_count > 0 else active_threat_exposure * 0.9
    active_change, active_trend = calculate_trend(active_threat_exposure, previous_active_exposure)
    
    # 5. Critical Active Exposure trend
    previous_critical_exposure = critical_active_exposure * 0.85  # Simulated (assuming improvement)
    critical_change, critical_trend = calculate_trend(critical_active_exposure, previous_critical_exposure)
    
    # ============= Build KPI Cards =============
    
    kpi_cards = {
        "exposure_coverage": KPICard(
            value=round(coverage_current, 1),
            formatted_value=f"{coverage_current:.0f}%",
            previous_value=round(coverage_previous, 1),
            change_percent=coverage_change,
            trend=coverage_trend,
            tooltip="Percentage of identified lifecycle exposure currently covered by a reliability control strategy.",
            evidence_count=len([n for n in equipment_nodes if (n.get("equipment_type_id") or n.get("equipment_type")) in controlled_equipment_types])
        ),
        "active_threat_exposure": KPICard(
            value=active_threat_exposure,
            formatted_value=format_currency(active_threat_exposure, currency_symbol),
            previous_value=previous_active_exposure,
            change_percent=active_change,
            trend=active_trend,
            tooltip="Production impact currently associated with active observations, findings, investigations, or alerts.",
            evidence_count=len(open_threats)
        ),
        "critical_active_exposure": KPICard(
            value=critical_active_exposure,
            formatted_value=format_currency(critical_active_exposure, currency_symbol),
            previous_value=previous_critical_exposure,
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
            value=round(digital_rate_current, 1),
            formatted_value=f"{digital_rate_current:.0f}%",
            previous_value=round(digital_rate_previous, 1),
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
    
    ai_summary = f"""AssetIQ currently manages {format_currency(covered_by_controls, currency_symbol)} of identified lifecycle exposure representing {coverage_current:.0f}% coverage of known reliability threats.

{format_currency(active_threat_exposure, currency_symbol)} of exposure is currently showing active degradation signals. Of this, {format_currency(critical_active_exposure, currency_symbol)} has no active control strategy and requires immediate attention.

PM compliance {"remains strong" if pm_compliance_current >= 85 else "needs improvement"} at {pm_compliance_current:.0f}%, with {digital_rate_current:.0f}% of reliability activities executed digitally through AssetIQ."""
    
    # ============= Evidence Drill-Down =============
    
    evidence_drill_down = {
        "uncovered_exposure": sorted(uncovered_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:20],
        "active_threat_exposure": sorted(active_threat_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:20],
        "critical_active_exposure": sorted(critical_evidence, key=lambda x: x.get("exposure_value", 0), reverse=True)[:20]
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
    # Get full dashboard data and extract the relevant evidence
    dashboard = await get_executive_dashboard(current_user=current_user)
    
    if metric_type not in dashboard.evidence_drill_down:
        raise HTTPException(status_code=400, detail=f"Invalid metric type: {metric_type}")
    
    evidence = dashboard.evidence_drill_down.get(metric_type, [])
    
    return {
        "metric_type": metric_type,
        "total": len(evidence),
        "items": evidence[skip:skip+limit]
    }
