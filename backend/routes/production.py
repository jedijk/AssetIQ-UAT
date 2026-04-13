"""
Production Dashboard API endpoints.
Aggregates form submission data for the Daily Production Overview.
"""
from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Production Dashboard"])

# Form template names that contain production data
EXTRUDER_FORM = "Extruder settings sample"
VISCOSITY_FORM = "Mooney Viscosity sample"
PRODUCTION_FORMS = [EXTRUDER_FORM, VISCOSITY_FORM, "Big Bag Loading", "Screen change", "Magnet cleaning"]

# Shift definitions
SHIFTS = {
    "day": {"label": "Day (06:00 - 22:00)", "start": 6, "end": 22},
    "night": {"label": "Night (22:00 - 06:00)", "start": 22, "end": 6},
}


def parse_submission_time(sub):
    """Extract datetime from a form submission."""
    # Try to get time from the values (Date & Time field)
    for v in sub.get("values", []):
        if v.get("field_label", "").lower() in ("date & time", "date", "datetime"):
            try:
                return datetime.fromisoformat(str(v["value"]).replace("Z", "+00:00"))
            except Exception:
                pass
    # Fallback to submitted_at
    try:
        return datetime.fromisoformat(str(sub.get("submitted_at", "")).replace("Z", "+00:00"))
    except Exception:
        return None


def extract_numeric(sub, field_label):
    """Extract numeric value from submission by field label."""
    for v in sub.get("values", []):
        label = v.get("field_label", "").strip().upper()
        if label == field_label.upper():
            try:
                return float(v["value"])
            except (ValueError, TypeError):
                return None
    return None


@router.get("/production/dashboard")
async def get_production_dashboard(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    shift: Optional[str] = Query("day", description="Shift: day or night"),
    equipment_id: Optional[str] = Query(None, description="Equipment/line ID"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get aggregated production dashboard data for a specific date and shift.
    Pulls data from form submissions (Extruder settings, Mooney Viscosity, etc.)
    """
    # Parse date
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            target_date = datetime.now(timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)

    # Build time range for the shift
    shift_config = SHIFTS.get(shift, SHIFTS["day"])
    if shift == "night":
        shift_start = target_date.replace(hour=22, minute=0, second=0, microsecond=0)
        shift_end = (target_date + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    else:
        shift_start = target_date.replace(hour=6, minute=0, second=0, microsecond=0)
        shift_end = target_date.replace(hour=22, minute=0, second=0, microsecond=0)

    shift_start_str = shift_start.isoformat()
    shift_end_str = shift_end.isoformat()

    # Query form submissions for this date range
    query = {
        "submitted_at": {"$gte": shift_start_str, "$lte": shift_end_str},
    }
    if equipment_id:
        query["equipment_id"] = equipment_id

    submissions = await db.form_submissions.find(query, {"_id": 0}).to_list(500)

    # Separate by form type
    extruder_subs = [s for s in submissions if s.get("form_template_name") == EXTRUDER_FORM]
    viscosity_subs = [s for s in submissions if s.get("form_template_name") == VISCOSITY_FORM]

    # Sort by time
    extruder_subs.sort(key=lambda s: s.get("submitted_at", ""))
    viscosity_subs.sort(key=lambda s: s.get("submitted_at", ""))

    # Build production log entries
    production_log = []
    total_feed = 0
    total_waste = 0
    viscosity_values = []
    rsd_values = []

    for sub in extruder_subs:
        entry = {
            "time": sub.get("submitted_at", ""),
            "submitted_by": sub.get("submitted_by_name", ""),
        }
        # Extract all numeric fields
        for v in sub.get("values", []):
            label = v.get("field_label", "").strip()
            try:
                val = float(v["value"])
                entry[label.lower().replace(" ", "_").replace("%", "pct").replace("&", "")] = val
            except (ValueError, TypeError):
                entry[label.lower().replace(" ", "_").replace("%", "")] = v.get("value")

        rpm = entry.get("rpm", 0) or 0
        feed = entry.get("feed", 0) or 0
        total_feed += feed
        production_log.append(entry)

    # Viscosity data
    for sub in viscosity_subs:
        measurement = extract_numeric(sub, "Measurement")
        if measurement is not None:
            viscosity_values.append(measurement)

    # Calculate KPIs
    avg_viscosity = round(sum(viscosity_values) / len(viscosity_values), 2) if viscosity_values else 0
    # RSD = (std dev / mean) * 100
    if len(viscosity_values) > 1 and avg_viscosity > 0:
        mean = sum(viscosity_values) / len(viscosity_values)
        variance = sum((v - mean) ** 2 for v in viscosity_values) / (len(viscosity_values) - 1)
        std_dev = variance ** 0.5
        rsd = round((std_dev / mean) * 100, 2)
    else:
        rsd = 0

    # Estimate waste and yield from the data (simplified)
    waste_kg = total_waste if total_waste > 0 else round(total_feed * 0.08, 1)  # Default 8% waste
    yield_pct = round((1 - waste_kg / total_feed) * 100, 2) if total_feed > 0 else 0

    # Runtime = number of log entries * interval (assume 15 min intervals)
    runtime_hours = round(len(production_log) * 0.25, 2) if production_log else 0

    # Build time series for charts
    waste_downtime_series = []
    for entry in production_log:
        t = entry.get("time", "")
        try:
            dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
            time_label = dt.strftime("%H:%M")
        except Exception:
            time_label = t[:5] if t else ""

        waste_downtime_series.append({
            "time": time_label,
            "waste": round(entry.get("feed", 0) * 0.08, 1) if entry.get("feed") else 0,
            "downtime": 0,
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
            "viscosity": 0,
        })

    # Build scatter data (Feed vs RPM vs Viscosity)
    scatter_data = []
    for i, entry in enumerate(production_log):
        visc = viscosity_values[i] if i < len(viscosity_values) else avg_viscosity
        scatter_data.append({
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
            "viscosity": visc,
            "waste": round(entry.get("feed", 0) * 0.08, 1) if entry.get("feed") else 0,
        })

    # Get production actions (from central_actions linked to this equipment)
    actions = []
    if equipment_id:
        action_docs = await db.central_actions.find(
            {"created_at": {"$gte": shift_start_str, "$lte": shift_end_str}},
            {"_id": 0, "id": 1, "title": 1, "description": 1, "status": 1, "created_at": 1, "priority": 1}
        ).sort("created_at", -1).to_list(20)
        actions = action_docs

    # Get production events / insights
    insights = await db.production_insights.find(
        {"date": date or target_date.strftime("%Y-%m-%d"), "equipment_id": equipment_id or ""},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)

    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "shift": shift,
        "shift_label": shift_config["label"],
        "equipment_id": equipment_id,
        "kpis": {
            "total_input": round(total_feed, 1),
            "waste": round(waste_kg, 1),
            "waste_pct": round((waste_kg / total_feed * 100), 1) if total_feed > 0 else 0,
            "yield_pct": yield_pct,
            "yield_target": 92.0,
            "avg_viscosity": avg_viscosity,
            "viscosity_range": "55-60",
            "rsd": rsd,
            "rsd_target": 7,
            "runtime_hours": runtime_hours,
            "shift_hours": f"{shift_config['start']:02d}:00 - {shift_config['end']:02d}:00",
            "sample_count": len(production_log),
        },
        "production_log": production_log,
        "waste_downtime_series": waste_downtime_series,
        "scatter_data": scatter_data,
        "viscosity_values": viscosity_values,
        "actions": actions,
        "insights": insights,
        "submissions_count": len(submissions),
    }


@router.post("/production/actions")
async def create_production_action(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a production action/event."""
    import uuid
    action = {
        "id": str(uuid.uuid4()),
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "type": data.get("type", "action"),  # action, event, insight
        "severity": data.get("severity", "info"),  # info, warning, critical
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "time": data.get("time", datetime.now(timezone.utc).strftime("%H:%M")),
        "equipment_id": data.get("equipment_id", ""),
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.production_insights.insert_one(action)
    del action["_id"] if "_id" in action else None
    return action


@router.post("/production/insights")
async def create_production_insight(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a daily production insight."""
    import uuid
    insight = {
        "id": str(uuid.uuid4()),
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "type": data.get("type", "insight"),
        "severity": data.get("severity", "info"),
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "time": data.get("time", datetime.now(timezone.utc).strftime("%H:%M")),
        "equipment_id": data.get("equipment_id", ""),
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.production_insights.insert_one(insight)
    del insight["_id"] if "_id" in insight else None
    return insight
