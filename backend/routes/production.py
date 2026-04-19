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


def _serialize_datetime(dt):
    """Serialize datetime to ISO format with UTC timezone suffix."""
    if dt is None:
        return ""
    if hasattr(dt, 'isoformat'):
        iso_str = dt.isoformat()
        # Ensure UTC suffix is present (MongoDB returns naive datetimes)
        if not iso_str.endswith('Z') and '+' not in iso_str and '-' not in iso_str[-6:]:
            iso_str += '+00:00'
        return iso_str
    return str(dt)


# Form template names that contain production data
EXTRUDER_FORM = "Extruder settings sample"
VISCOSITY_FORM = "Mooney viscosity sample"
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
    """Extract a value from a submission's values array by field_label or field_id (case-insensitive)."""
    target = field_label.strip().lower()
    # Normalize: "Date & Time" -> also match "date_&_time"
    target_normalized = target.replace(" ", "_").replace("&", "&")
    for v in submission.get("values", []):
        label = (v.get("field_label") or "").strip().lower()
        fid = (v.get("field_id") or "").strip().lower()
        if label == target or fid == target or label == target_normalized or fid == target_normalized:
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
    # Use case-insensitive regex to match template names
    form_patterns = "|".join(PRODUCTION_FORMS)

    # Find Line-90 equipment ID and all ancestor/descendant IDs
    line90 = await db.equipment_nodes.find_one(
        {"name": {"$regex": "Line.?90", "$options": "i"}}, {"_id": 0, "id": 1, "parent_id": 1}
    )
    equipment_ids = []
    if line90:
        equipment_ids.append(line90["id"])
        # Include ancestors (parent, grandparent) — submissions may be assigned at installation level
        if line90.get("parent_id"):
            equipment_ids.append(line90["parent_id"])
            parent = await db.equipment_nodes.find_one(
                {"id": line90["parent_id"]}, {"_id": 0, "parent_id": 1}
            )
            if parent and parent.get("parent_id"):
                equipment_ids.append(parent["parent_id"])

        # Include descendants (children, grandchildren) — submissions may be assigned to sub-units
        children = await db.equipment_nodes.find(
            {"parent_id": line90["id"]}, {"_id": 0, "id": 1}
        ).to_list(50)
        child_ids = [c["id"] for c in children]
        equipment_ids.extend(child_ids)

        if child_ids:
            grandchildren = await db.equipment_nodes.find(
                {"parent_id": {"$in": child_ids}}, {"_id": 0, "id": 1}
            ).to_list(200)
            equipment_ids.extend([gc["id"] for gc in grandchildren])

    equipment_match = [
        {"equipment_name": {"$regex": "Line.?90", "$options": "i"}},
        {"equipment_name": EQUIPMENT_NAME},
    ]
    if equipment_ids:
        equipment_match.append({"equipment_id": {"$in": equipment_ids}})

    query = {
        "form_template_name": {"$regex": f"^({form_patterns})$", "$options": "i"},
        "$or": equipment_match,
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

    # Separate by form type (case-insensitive)
    def match_template(sub, name):
        return sub.get("form_template_name", "").lower() == name.lower()

    extruder_subs = sorted(
        [s for s in submissions if match_template(s, EXTRUDER_FORM)],
        key=lambda s: s.get("_parsed_time", datetime.min.replace(tzinfo=timezone.utc)),
    )
    viscosity_subs = sorted(
        [s for s in submissions if match_template(s, VISCOSITY_FORM)],
        key=lambda s: s.get("_parsed_time", datetime.min.replace(tzinfo=timezone.utc)),
    )
    big_bag_subs = [s for s in submissions if match_template(s, BIG_BAG_FORM)]
    screen_change_subs = [s for s in submissions if match_template(s, SCREEN_CHANGE_FORM)]
    magnet_subs = [s for s in submissions if match_template(s, MAGNET_CLEANING_FORM)]

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
            "datetime": _serialize_datetime(dt),
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
                "submission_id": sub.get("id", ""),
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
        production_date = extract_field(sub, "Production Date") or ""
        big_bag_entries.append({
            "time": time_label,
            "material": material,
            "supplier": supplier,
            "bag_no": bag_no,
            "lot_no": lot_no,
            "production_date": production_date,
            "submission_id": sub.get("id", ""),
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
            "submission_id": entry.get("submission_id", ""),
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
        "created_at": _serialize_datetime(datetime.now(timezone.utc)),
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
    updates = data.get("values", {})
    if not updates:
        return {"error": "No values provided"}

    sub = await db.form_submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        return {"error": "Submission not found"}

    # Update matching fields in the values array (case-insensitive, space/underscore normalized)
    updates_lower = {k.lower(): v for k, v in updates.items()}
    # Also create underscore-normalized keys for matching multi-word fields
    updates_normalized = {k.replace(" ", "_"): v for k, v in updates_lower.items()}
    new_values = []
    matched_count = 0
    for v in sub.get("values", []):
        label = v.get("field_label", "")
        fid = v.get("field_id", "")
        label_lower = label.lower()
        fid_lower = fid.lower()
        # Also normalize underscores for comparison
        label_norm = label_lower.replace(" ", "_")
        fid_norm = fid_lower.replace(" ", "_")
        matched_key = None
        for k in updates_lower:
            k_norm = k.replace(" ", "_")
            if k == label_lower or k == fid_lower or k_norm == label_norm or k_norm == fid_norm:
                matched_key = k
                break
        if matched_key is not None:
            old_val = v.get("value")
            new_val = str(updates_lower[matched_key])
            if old_val != new_val:
                logger.info(f"PATCH {submission_id[:15]}: '{label}' {old_val} -> {new_val}")
            new_values.append({**v, "value": new_val})
            matched_count += 1
        else:
            new_values.append(v)

    if matched_count == 0:
        logger.warning(f"PATCH {submission_id[:15]}: NO fields matched! sent={list(updates.keys())}, db={[v.get('field_label','') for v in sub.get('values',[])]}")

    await db.form_submissions.update_one(
        {"id": submission_id},
        {"$set": {"values": new_values, "updated_at": _serialize_datetime(datetime.now(timezone.utc))}}
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


@router.post("/production/ai-insights")
async def generate_ai_insights(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Generate AI-powered daily insights by analyzing the current production data."""
    import os
    from services.openai_service import chat_completion

    date = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    production_log = data.get("production_log", [])
    viscosity_values = data.get("viscosity_values", [])
    kpis = data.get("kpis", {})

    # Build the analysis prompt
    log_text = ""
    for entry in production_log:
        log_text += f"  {entry.get('time','')} | RPM:{entry.get('rpm','')} Feed:{entry.get('feed','')} M%:{entry.get('moisture','')} Energy:{entry.get('energy','')} MT1:{entry.get('mt1','')} MT2:{entry.get('mt2','')} MT3:{entry.get('mt3','')} MP4:{entry.get('mp4','')} CO2:{entry.get('co2_feed_p','')} T_IR:{entry.get('t_product_ir','')} Waste:{entry.get('waste','')} Remarks:{entry.get('remarks','')}\n"

    visc_text = ", ".join([str(v) for v in viscosity_values]) if viscosity_values else "No samples"

    kpi_text = f"""Total Input: {kpis.get('total_input', 0)} kg
Waste: {kpis.get('waste', 0)} kg ({kpis.get('waste_pct', 0)}%)
Yield: {kpis.get('yield_pct', 0)}% (target: {kpis.get('yield_target', 92)}%)
Avg Mooney Viscosity: {kpis.get('avg_viscosity', 0)} MU (range: {kpis.get('viscosity_range', '55-60')})
RSD: {kpis.get('rsd', 0)}% (target: <{kpis.get('rsd_target', 7)}%)
Runtime: {kpis.get('runtime_hours', 0)} hours
Samples: {kpis.get('sample_count', 0)} extruder, {kpis.get('viscosity_sample_count', 0)} viscosity"""

    prompt = f"""Analyze this production data for Line-90 extruder on {date} and generate 3-5 concise daily insights.

KPIs:
{kpi_text}

Mooney Viscosity samples: {visc_text}

Production Log:
{log_text}

Rules:
- Each insight should have a severity: critical, warning, success, or info
- Focus on anomalies, trends, quality issues, and operational efficiency
- Be specific with times and values
- Keep each insight title under 50 chars, description under 100 chars
- Return ONLY valid JSON array, no markdown, no explanation

Format:
[{{"title": "...", "description": "...", "severity": "critical|warning|success|info", "time": "HH:MM"}}]"""

    try:
        messages = [
            {"role": "system", "content": "You are a production engineer AI assistant analyzing extruder and rubber compound production data. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ]
        
        response = await chat_completion(
            messages=messages,
            model="gpt-4o",
            temperature=0.7
        )

        # Parse JSON response
        import json as json_module
        # Strip markdown code blocks if present
        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        insights = json_module.loads(clean)

        # Delete existing AI insights for this date
        await db.production_events.delete_many({"date": date, "type": "insight", "_ai_generated": True})

        # Save new AI insights
        saved = []
        for ins in insights:
            event = {
                "id": str(uuid.uuid4()),
                "title": ins.get("title", ""),
                "description": ins.get("description", ""),
                "type": "insight",
                "severity": ins.get("severity", "info"),
                "date": date,
                "time": ins.get("time", ""),
                "equipment_name": EQUIPMENT_NAME,
                "created_by": current_user["id"],
                "created_by_name": "AI",
                "created_at": _serialize_datetime(datetime.now(timezone.utc)),
                "_ai_generated": True,
            }
            await db.production_events.insert_one(event)
            event.pop("_id", None)
            saved.append(event)

        return {"status": "ok", "insights": saved, "count": len(saved)}

    except Exception as e:
        logger.error(f"AI insights generation failed: {e}")
        return {"status": "error", "error": str(e), "insights": []}
