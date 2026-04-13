"""
Production Dashboard API endpoints.
Aggregates form submission data for the Daily Production Overview (Line 90).
"""
from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging
import uuid

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Production Dashboard"])

# Form template names that contain production data
EXTRUDER_FORM = "Extruder settings sample"
VISCOSITY_FORM = "Mooney Viscosity sample"
BIG_BAG_FORM = "Big Bag Loading"
SCREEN_CHANGE_FORM = "Screen change"
MAGNET_CLEANING_FORM = "Magnet cleaning"

PRODUCTION_FORMS = [EXTRUDER_FORM, VISCOSITY_FORM, BIG_BAG_FORM, SCREEN_CHANGE_FORM, MAGNET_CLEANING_FORM]

EQUIPMENT_NAME = "Line-90"

# Shift definitions
SHIFTS = {
    "day": {"label": "Day (06:00 - 22:00)", "start_hour": 6, "end_hour": 22},
    "night": {"label": "Night (22:00 - 06:00)", "start_hour": 22, "end_hour": 6},
}


def extract_field(submission, field_label):
    """Extract a value from a submission's values array by field_label (case-insensitive)."""
    target = field_label.strip().lower()
    for v in submission.get("values", []):
        label = v.get("field_label", "").strip().lower()
        if label == target:
            return v.get("value")
    return None


def extract_numeric(submission, field_label):
    """Extract numeric value from submission by field label."""
    val = extract_field(submission, field_label)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_submitted_at(sub):
    """Parse submitted_at into a datetime object."""
    raw = sub.get("submitted_at", "")
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/production/dashboard")
async def get_production_dashboard(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (single day, used if from_date not set)"),
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD"),
    shift: Optional[str] = Query("day", description="Shift: day or night"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get aggregated production dashboard data.
    Supports single-day (date) or range (from_date + to_date).
    """
    now = datetime.now(timezone.utc)

    # Determine the effective date range
    if from_date and to_date:
        try:
            range_start = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            range_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        try:
            range_end = datetime.strptime(to_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            range_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Full days: start at 00:00 of from_date, end at 23:59 of to_date
        range_start = range_start.replace(hour=0, minute=0, second=0, microsecond=0)
        range_end = range_end.replace(hour=23, minute=59, second=59, microsecond=999999)
        target_date = range_start
        is_range = True
    else:
        # Single day mode (backward compatible)
        if date:
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                target_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            target_date = now.replace(hour=0, minute=0, second=0, microsecond=0)

        shift_config = SHIFTS.get(shift, SHIFTS["day"])
        if shift == "night":
            range_start = target_date.replace(hour=22, minute=0, second=0, microsecond=0)
            range_end = (target_date + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        else:
            range_start = target_date.replace(hour=6, minute=0, second=0, microsecond=0)
            range_end = target_date.replace(hour=22, minute=0, second=0, microsecond=0)
        is_range = False

    shift_config = SHIFTS.get(shift, SHIFTS["day"])

    # Query all form submissions for production forms for Line-90 in date range
    # submitted_at can be stored as string or datetime, handle both
    query = {
        "form_template_name": {"$in": PRODUCTION_FORMS},
        "$or": [
            {"equipment_name": {"$regex": "Line.?90", "$options": "i"}},
            {"equipment_name": EQUIPMENT_NAME},
        ],
    }

    all_subs = await db.form_submissions.find(query, {"_id": 0}).to_list(1000)

    # Filter by date range
    submissions = []
    for sub in all_subs:
        dt = parse_submitted_at(sub)
        if dt is None:
            continue
        # Also check the Date & Time field inside values
        date_time_val = extract_field(sub, "Date & Time")
        if date_time_val:
            try:
                dt = datetime.fromisoformat(str(date_time_val).replace("Z", "+00:00"))
            except Exception:
                pass
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if range_start <= dt <= range_end:
            sub["_parsed_time"] = dt
            submissions.append(sub)

    # Separate by form type
    extruder_subs = sorted(
        [s for s in submissions if s.get("form_template_name") == EXTRUDER_FORM],
        key=lambda s: s.get("_parsed_time", datetime.min.replace(tzinfo=timezone.utc)),
    )
    viscosity_subs = sorted(
        [s for s in submissions if s.get("form_template_name") == VISCOSITY_FORM],
        key=lambda s: s.get("_parsed_time", datetime.min.replace(tzinfo=timezone.utc)),
    )
    big_bag_subs = [s for s in submissions if s.get("form_template_name") == BIG_BAG_FORM]
    screen_change_subs = [s for s in submissions if s.get("form_template_name") == SCREEN_CHANGE_FORM]
    magnet_subs = [s for s in submissions if s.get("form_template_name") == MAGNET_CLEANING_FORM]

    # Build production log entries from extruder data
    production_log = []
    total_feed = 0.0
    total_waste = 0.0

    for sub in extruder_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""

        rpm = extract_numeric(sub, "RPM") or 0
        feed = extract_numeric(sub, "FEED") or 0
        moisture = extract_numeric(sub, "M%") or 0
        energy = extract_numeric(sub, "ENERGY") or 0
        mt1 = extract_numeric(sub, "MT1") or 0
        mt2 = extract_numeric(sub, "MT2") or 0
        mt3 = extract_numeric(sub, "MT3") or 0
        mp1 = extract_numeric(sub, "MP1") or 0
        mp2 = extract_numeric(sub, "MP2") or 0
        mp3 = extract_numeric(sub, "MP3") or 0
        mp4 = extract_numeric(sub, "MP4") or 0
        co2_feed_p = extract_field(sub, "CO2 Feed/P") or extract_field(sub, "CO2 Feeds") or ""
        t_product_ir = extract_numeric(sub, "T Product IR") or 0
        remarks = extract_field(sub, "Remarks") or extract_field(sub, "REMARKS") or ""
        waste = extract_numeric(sub, "Waste") or 0

        total_feed += feed
        total_waste += waste

        production_log.append({
            "time": time_label,
            "datetime": dt.isoformat() if dt else "",
            "submitted_by": sub.get("submitted_by_name", ""),
            "rpm": rpm,
            "feed": feed,
            "moisture": moisture,
            "energy": energy,
            "mt1": mt1,
            "mt2": mt2,
            "mt3": mt3,
            "mp1": mp1,
            "mp2": mp2,
            "mp3": mp3,
            "mp4": mp4,
            "co2_feed_p": co2_feed_p,
            "t_product_ir": t_product_ir,
            "remarks": remarks,
            "waste": waste,
            "submission_id": sub.get("id", ""),
        })

    # Viscosity data
    viscosity_values = []
    viscosity_entries = []
    for sub in viscosity_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""
        measurement = extract_numeric(sub, "Measurement")
        sample_no = extract_field(sub, "Sample No.")
        if measurement is not None:
            viscosity_values.append(measurement)
            viscosity_entries.append({
                "time": time_label,
                "sample_no": sample_no,
                "value": measurement,
            })

    # Big Bag Loading data
    big_bag_entries = []
    for sub in big_bag_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""
        material = extract_field(sub, "Input material") or ""
        supplier = extract_field(sub, "Supplier") or ""
        bag_no = extract_field(sub, "Bag No.") or ""
        lot_no = extract_field(sub, "Lot No.") or ""
        big_bag_entries.append({
            "time": time_label,
            "material": material,
            "supplier": supplier,
            "bag_no": bag_no,
            "lot_no": lot_no,
        })

    # Calculate KPIs
    avg_viscosity = round(sum(viscosity_values) / len(viscosity_values), 2) if viscosity_values else 0
    if len(viscosity_values) > 1 and avg_viscosity > 0:
        mean = sum(viscosity_values) / len(viscosity_values)
        variance = sum((v - mean) ** 2 for v in viscosity_values) / (len(viscosity_values) - 1)
        std_dev = variance ** 0.5
        rsd = round((std_dev / mean) * 100, 2)
    else:
        rsd = 0

    # Waste calculation
    waste_kg = total_waste if total_waste > 0 else round(total_feed * 0.08, 1)
    waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 else 0
    yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

    # Runtime estimation
    if len(production_log) >= 2:
        first_t = production_log[0].get("datetime", "")
        last_t = production_log[-1].get("datetime", "")
        try:
            t1 = datetime.fromisoformat(first_t)
            t2 = datetime.fromisoformat(last_t)
            runtime_hours = round((t2 - t1).total_seconds() / 3600, 2)
        except Exception:
            runtime_hours = round(len(production_log) * 0.25, 2)
    else:
        runtime_hours = round(len(production_log) * 0.25, 2)

    # Build chart time series (waste + downtime over time)
    waste_downtime_series = []
    for entry in production_log:
        waste_downtime_series.append({
            "time": entry["time"],
            "waste": entry.get("waste", 0),
            "downtime": 0,
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
        })

    # Build scatter data (Feed vs RPM vs Viscosity)
    scatter_data = []
    for i, entry in enumerate(production_log):
        visc = viscosity_values[i] if i < len(viscosity_values) else avg_viscosity
        scatter_data.append({
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
            "viscosity": visc,
            "waste": entry.get("waste", 0),
            "time": entry.get("time", ""),
        })

    # Viscosity over time series
    viscosity_series = []
    for entry in viscosity_entries:
        viscosity_series.append({
            "time": entry["time"],
            "viscosity": entry["value"],
            "sample": entry.get("sample_no", ""),
        })

    # Get production actions/insights from dedicated collection
    if is_range:
        event_date_query = {"date": {"$gte": range_start.strftime("%Y-%m-%d"), "$lte": range_end.strftime("%Y-%m-%d")}}
    else:
        event_date_query = {"date": target_date.strftime("%Y-%m-%d")}

    actions_query = {**event_date_query, "type": "action"}
    actions = await db.production_events.find(
        actions_query, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    insights_query = {**event_date_query, "type": "insight"}
    insights = await db.production_events.find(
        insights_query, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    # Lot info from Big Bag Loading
    lot_info = ""
    if big_bag_entries:
        lots = [e.get("lot_no", "") for e in big_bag_entries if e.get("lot_no")]
        materials = [e.get("material", "") for e in big_bag_entries if e.get("material")]
        if lots:
            lot_info = f"Lot: {lots[0]}"
        if materials:
            lot_info += f" {materials[0]}" if lot_info else materials[0]

    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "from_date": range_start.strftime("%Y-%m-%d"),
        "to_date": range_end.strftime("%Y-%m-%d"),
        "is_range": is_range,
        "shift": shift,
        "shift_label": shift_config["label"],
        "equipment_name": EQUIPMENT_NAME,
        "kpis": {
            "total_input": round(total_feed, 1),
            "lot_info": lot_info,
            "waste": round(waste_kg, 1),
            "waste_pct": waste_pct,
            "yield_pct": yield_pct,
            "yield_target": 92.0,
            "avg_viscosity": avg_viscosity,
            "viscosity_range": "55-60",
            "rsd": rsd,
            "rsd_target": 7,
            "runtime_hours": runtime_hours,
            "shift_hours": f"{shift_config['start_hour']:02d}:00 - {shift_config['end_hour']:02d}:00",
            "sample_count": len(production_log),
            "viscosity_sample_count": len(viscosity_values),
        },
        "production_log": production_log,
        "waste_downtime_series": waste_downtime_series,
        "scatter_data": scatter_data,
        "viscosity_series": viscosity_series,
        "viscosity_values": viscosity_values,
        "big_bag_entries": big_bag_entries,
        "screen_changes": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else ""} for s in screen_change_subs],
        "magnet_cleanings": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else ""} for s in magnet_subs],
        "actions": actions,
        "insights": insights,
        "submissions_count": len(submissions),
    }


@router.get("/production/events")
async def get_production_events(
    date: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None, description="action or insight"),
    current_user: dict = Depends(get_current_user),
):
    """Get production events/actions/insights for a given date."""
    query = {}
    if date:
        query["date"] = date
    if event_type:
        query["type"] = event_type

    events = await db.production_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"events": events, "total": len(events)}


@router.post("/production/events")
async def create_production_event(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Create a production action or insight event."""
    event = {
        "id": str(uuid.uuid4()),
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "type": data.get("type", "action"),
        "severity": data.get("severity", "info"),
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "time": data.get("time", datetime.now(timezone.utc).strftime("%H:%M")),
        "equipment_name": EQUIPMENT_NAME,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.production_events.insert_one(event)
    # Remove MongoDB _id before returning
    event.pop("_id", None)
    return event


@router.delete("/production/events/{event_id}")
async def delete_production_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a production event."""
    result = await db.production_events.delete_one({"id": event_id})
    if result.deleted_count == 0:
        return {"error": "Event not found"}
    return {"status": "deleted", "id": event_id}


@router.patch("/production/submission/{submission_id}")
async def update_production_submission(
    submission_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update field values on a production form submission."""
    # data.values is a dict of {field_label: new_value}
    updates = data.get("values", {})
    if not updates:
        return {"error": "No values provided"}

    sub = await db.form_submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        return {"error": "Submission not found"}

    # Update matching fields in the values array
    new_values = []
    for v in sub.get("values", []):
        label = v.get("field_label", "")
        if label in updates:
            new_values.append({**v, "value": str(updates[label])})
        else:
            new_values.append(v)

    await db.form_submissions.update_one(
        {"id": submission_id},
        {"$set": {"values": new_values, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "updated", "id": submission_id}



@router.delete("/production/seed-data")
async def clear_seed_data(
    current_user: dict = Depends(get_current_user),
):
    """Clear all seeded production sample data. Use this to remove demo data."""
    # Delete seeded form submissions
    result_subs = await db.form_submissions.delete_many({"_seeded": True})
    # Delete seeded production events
    result_events = await db.production_events.delete_many({"_seeded": True})
    return {
        "status": "cleared",
        "submissions_deleted": result_subs.deleted_count,
        "events_deleted": result_events.deleted_count,
    }
