"""
Production Dashboard API endpoints.
Aggregates form submission data for the Daily Production Overview (Line 90).
"""
from fastapi import APIRouter, Depends, Query, HTTPException
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
END_OF_SHIFT_FORM = "End of shift"

PRODUCTION_FORMS = [EXTRUDER_FORM, VISCOSITY_FORM, BIG_BAG_FORM, SCREEN_CHANGE_FORM, MAGNET_CLEANING_FORM, END_OF_SHIFT_FORM]

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

    # Production forms without equipment are implicitly for Line-90
    # Include them in the query by adding conditions for empty/null equipment
    forms_without_equipment = {
        "form_template_name": {"$regex": f"^({END_OF_SHIFT_FORM}|{MAGNET_CLEANING_FORM}|{SCREEN_CHANGE_FORM})$", "$options": "i"},
        "$or": [
            {"equipment_id": ""},
            {"equipment_id": None},
            {"equipment_id": {"$exists": False}},
        ]
    }
    
    query = {
        "$or": [
            # Standard query: production forms with Line-90 equipment
            {
                "form_template_name": {"$regex": f"^({form_patterns})$", "$options": "i"},
                "$or": equipment_match,
            },
            # Forms without equipment (implicitly Line-90)
            forms_without_equipment,
        ]
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
    end_of_shift_subs = sorted(
        [s for s in submissions if match_template(s, END_OF_SHIFT_FORM)],
        key=lambda s: s.get("_parsed_time", datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )

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

    # End of Shift data
    end_of_shift_entries = []
    for sub in end_of_shift_subs:
        dt = sub.get("_parsed_time")
        date_time_raw = extract_field(sub, "Date & Time") or ""
        total_input = extract_numeric(sub, "Total Input")
        total_wast = extract_numeric(sub, "Total Wast")
        # Extract notes/comments for display on hover
        notes = sub.get("notes") or ""
        end_of_shift_entries.append({
            "datetime": _serialize_datetime(dt),
            "date_time_raw": date_time_raw,
            "total_input": total_input if total_input is not None else 0,
            "total_waste": total_wast if total_wast is not None else 0,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
            "notes": notes,
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

    # Waste calculation - only show reported waste; do not fabricate an estimate
    waste_kg = total_waste
    waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 and waste_kg > 0 else 0
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
            "datetime": entry.get("datetime", ""),
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

    # ── ALWAYS merge ingested production_logs data (not just as fallback) ──
    # This allows data uploaded via Log Ingestion to show alongside form submissions.
    ingested_query = {
        "asset_id": {"$regex": "line.?90", "$options": "i"},
        "timestamp": {"$gte": range_start.strftime("%Y-%m-%dT%H:%M:%S"), "$lte": range_end.strftime("%Y-%m-%dT%H:%M:%S")},
    }
    # Deduplicate: prefer entries with mooney_viscosity
    pipeline = [
        {"$match": ingested_query},
        {"$addFields": {"_has_visc": {"$cond": [{"$gt": [{"$ifNull": ["$mooney_viscosity", ""]}, ""]}, 1, 0]}}},
        {"$sort": {"timestamp": 1, "_has_visc": -1}},
        {"$group": {"_id": "$timestamp", "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$sort": {"timestamp": 1}},
        {"$project": {"_id": 0, "_has_visc": 0}},
    ]
    ingested = await db.production_logs.aggregate(pipeline).to_list(5000)

    if ingested:
        # NOTE: total_feed (Total Input) is NO LONGER calculated from ingested FEED values.
        # Total Input now comes ONLY from End of Shift entries (see below).
        total_waste_val = 0.0
        for entry in ingested:
            m = entry.get("metrics", {})
            # Extract feed value for display in production_log, but NOT for total_input calculation
            feed_val = 0
            try:
                feed_val = float(m.get("FEED", 0) or 0)
            except (ValueError, TypeError):
                pass

            ts = entry.get("timestamp", "")
            time_label = ""
            try:
                time_label = datetime.fromisoformat(ts).strftime("%H:%M")
            except Exception:
                pass

            rpm = 0
            try: rpm = float(m.get("RPM", 0) or 0)
            except: pass
            moisture = 0
            try:
                moisture = float(m.get("M%", 0) or 0)
                if 0 < moisture < 1:
                    moisture = round(moisture * 100, 1)
            except: pass
            energy = 0
            try: energy = float(m.get("ENERGY", 0) or 0)
            except: pass
            mt1 = 0
            try: mt1 = float(m.get("MT1", 0) or 0)
            except: pass
            mt2 = 0
            try: mt2 = float(m.get("MT2", 0) or 0)
            except: pass
            mt3_raw = m.get("MT3", 0)
            mt3 = 0
            try: mt3 = float(mt3_raw) if mt3_raw and mt3_raw != "-" else 0
            except: pass
            mp1 = 0
            try: mp1 = float(m.get("MP1", 0) or 0)
            except: pass
            mp2 = 0
            try: mp2 = float(m.get("MP2", 0) or 0)
            except: pass
            mp3 = 0
            try: mp3 = float(m.get("MP3", 0) or 0)
            except: pass
            mp4 = 0
            try: mp4 = float(m.get("MP4", 0) or 0)
            except: pass
            co2 = m.get("CO2 Feed/P", "")
            t_prod_ir = 0
            try: t_prod_ir = float(m.get("T Product IR", 0) or 0)
            except: pass

            production_log.append({
                "time": time_label,
                "datetime": ts,
                "submitted_by": "Log Ingestion",
                "rpm": rpm, "feed": feed_val, "moisture": moisture, "energy": energy,
                "mt1": mt1, "mt2": mt2, "mt3": mt3,
                "mp1": mp1, "mp2": mp2, "mp3": mp3, "mp4": mp4,
                "co2_feed_p": co2, "t_product_ir": t_prod_ir,
                "remarks": entry.get("status", ""),
                "waste": 0,
                "submission_id": entry.get("id", ""),
            })

            # Viscosity
            visc_str = entry.get("mooney_viscosity")
            if visc_str:
                try:
                    visc_val = float(visc_str)
                    viscosity_values.append(visc_val)
                    viscosity_series.append({
                        "time": time_label,
                        "datetime": ts,
                        "viscosity": visc_val,
                        "sample": entry.get("sample_id", ""),
                        "submission_id": entry.get("id", ""),
                    })
                except (ValueError, TypeError):
                    pass

            # Waste/downtime series
            waste_downtime_series.append({
                "time": time_label,
                "datetime": ts,
                "waste": 0, "downtime": 0,
                "feed": feed_val, "rpm": rpm,
            })

            # Magnet cleaning — detect from clean_magnet_status or clean_magnet_time
            magnet_status = str(entry.get("clean_magnet_status") or "").strip().lower()
            magnet_time_val = entry.get("clean_magnet_time")
            has_magnet = (
                magnet_status in ("done", "ok", "yes")
                or (magnet_status and ":" in magnet_status)  # time value like "06:30:00"
                or (magnet_time_val and str(magnet_time_val).strip())
            )
            if has_magnet:
                magnet_subs.append({"_parsed_time": datetime.fromisoformat(ts) if ts else None})

            # Screen changes — detect from status/remarks text
            status_text = str(entry.get("status") or "").lower()
            if "screen" in status_text and "change" in status_text:
                screen_change_subs.append({"_parsed_time": datetime.fromisoformat(ts) if ts else None})

            # Input material → big bag entries
            if entry.get("input_material"):
                big_bag_entries.append({
                    "time": time_label,
                    "material": entry.get("input_material", ""),
                    "supplier": entry.get("supplier", ""),
                    "bag_no": entry.get("bag_no", ""),
                    "lot_no": entry.get("lot_no", ""),
                    "production_date": entry.get("production_date", ""),
                    "submission_id": entry.get("id", ""),
                })

        # Recalculate KPIs from ingested data
        waste_from_entry = 0
        try:
            waste_from_entry = float(ingested[0].get("total_waste", 0) or 0)
        except (ValueError, TypeError):
            pass
        total_waste = waste_from_entry if waste_from_entry > 0 else total_waste
        waste_kg = total_waste
        waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 else 0
        yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

        avg_viscosity = round(sum(viscosity_values) / len(viscosity_values), 2) if viscosity_values else 0
        if len(viscosity_values) > 1 and avg_viscosity > 0:
            mean_v = sum(viscosity_values) / len(viscosity_values)
            variance_v = sum((v - mean_v) ** 2 for v in viscosity_values) / (len(viscosity_values) - 1)
            rsd = round((variance_v ** 0.5 / mean_v) * 100, 2)
        else:
            rsd = 0

        if len(production_log) >= 2:
            try:
                t1 = datetime.fromisoformat(production_log[0]["datetime"])
                t2 = datetime.fromisoformat(production_log[-1]["datetime"])
                runtime_hours = round((t2 - t1).total_seconds() / 3600, 2)
            except Exception:
                runtime_hours = 0
        else:
            runtime_hours = 0

        # Update lot_info
        if big_bag_entries and not lot_info:
            lots = [e.get("lot_no", "") for e in big_bag_entries if e.get("lot_no")]
            materials_list = [e.get("material", "") for e in big_bag_entries if e.get("material")]
            if lots:
                lot_info = f"Lot: {lots[0]}"
            if materials_list:
                lot_info += f" {materials_list[0]}" if lot_info else materials_list[0]

        # Update viscosity range
        visc_min = min(viscosity_values) if viscosity_values else 55
        visc_max = max(viscosity_values) if viscosity_values else 60

    # Override Total Input and Total Waste with End of Shift sums when available
    # (This runs AFTER any ingested-data fallback so End of Shift always wins.)
    if end_of_shift_entries:
        total_feed = sum(float(e.get("total_input") or 0) for e in end_of_shift_entries)
        total_waste = sum(float(e.get("total_waste") or 0) for e in end_of_shift_entries)
        waste_kg = total_waste
        waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 and waste_kg > 0 else 0
        yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

    # Viscosity range string
    visc_range_str = "55-60"
    if viscosity_values:
        visc_range_str = f"{min(viscosity_values):.1f}-{max(viscosity_values):.1f}"

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
            "viscosity_range": visc_range_str,
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
        "end_of_shift_entries": end_of_shift_entries,
        "screen_changes": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else "", "datetime": s.get("_parsed_time").isoformat() if s.get("_parsed_time") else ""} for s in screen_change_subs],
        "magnet_cleanings": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else "", "datetime": s.get("_parsed_time").isoformat() if s.get("_parsed_time") else ""} for s in magnet_subs],
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
    """Update field values on a production form submission OR an ingested production_logs entry."""
    updates = data.get("values", {})
    if not updates:
        raise HTTPException(status_code=400, detail="No values provided")

    sub = await db.form_submissions.find_one({"id": submission_id}, {"_id": 0})
    if sub:
        # Update matching fields in the values array (case-insensitive, space/underscore normalized)
        updates_lower = {k.lower(): v for k, v in updates.items()}
        new_values = []
        matched_count = 0
        for v in sub.get("values", []):
            label = v.get("field_label", "")
            fid = v.get("field_id", "")
            label_lower = label.lower()
            fid_lower = fid.lower()
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
        return {"status": "updated", "source": "form_submission", "id": submission_id, "matched_fields": matched_count}

    # Fallback: try the ingested production_logs collection
    log_entry = await db.production_logs.find_one({"id": submission_id}, {"_id": 0})
    if not log_entry:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Map frontend field labels to production_logs schema
    # Metrics live in `metrics` dict, viscosity in top-level `mooney_viscosity`, remarks in `status`.
    metrics_keys = {"RPM", "FEED", "M%", "ENERGY", "MT1", "MT2", "MT3",
                    "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR"}
    # Build case-insensitive lookup
    updates_norm = {str(k).strip(): v for k, v in updates.items()}
    updates_ci = {k.lower(): (k, v) for k, v in updates_norm.items()}

    set_ops = {}
    matched = 0
    current_metrics = dict(log_entry.get("metrics") or {})

    for mk in metrics_keys:
        hit = updates_ci.get(mk.lower())
        if hit is None:
            continue
        _, raw_val = hit
        # Preserve numeric type where possible
        try:
            current_metrics[mk] = float(raw_val) if raw_val not in (None, "") else raw_val
        except (ValueError, TypeError):
            current_metrics[mk] = raw_val
        matched += 1

    if any(k.lower() in updates_ci for k in ("RPM", "FEED", "M%", "ENERGY", "MT1", "MT2", "MT3",
                                              "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR")):
        set_ops["metrics"] = current_metrics

    # Viscosity ("Measurement" or "Mooney" or "mooney_viscosity")
    for visc_key in ("measurement", "mooney", "mooney_viscosity", "viscosity"):
        if visc_key in updates_ci:
            _, v = updates_ci[visc_key]
            try:
                set_ops["mooney_viscosity"] = float(v) if v not in (None, "") else None
            except (ValueError, TypeError):
                set_ops["mooney_viscosity"] = v
            matched += 1
            break

    # Remarks
    if "remarks" in updates_ci:
        _, v = updates_ci["remarks"]
        set_ops["status"] = v
        matched += 1

    if not set_ops:
        logger.warning(f"PATCH production_log {submission_id[:15]}: no matching keys. sent={list(updates.keys())}")
        raise HTTPException(status_code=400, detail="No matching fields to update")

    set_ops["updated_at"] = _serialize_datetime(datetime.now(timezone.utc))
    await db.production_logs.update_one({"id": submission_id}, {"$set": set_ops})
    logger.info(f"PATCH production_log {submission_id[:15]}: updated {matched} fields ({list(set_ops.keys())})")
    return {"status": "updated", "source": "production_log", "id": submission_id, "matched_fields": matched}



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


@router.post("/production/machine-analysis")
async def generate_machine_analysis(
    data: dict = None,
    current_user: dict = Depends(get_current_user),
):
    """AI-powered analysis of production data to determine optimal machine settings. Accepts optional date range."""
    import statistics
    from services.openai_service import chat_completion

    data = data or {}
    start = data.get("start")
    end = data.get("end")

    # Build match filter
    match_filter = {"mooney_viscosity": {"$exists": True, "$ne": None, "$ne": ""}}
    if start and end:
        match_filter["timestamp"] = {"$gte": f"{start}T00:00:00", "$lte": f"{end}T23:59:59"}
    elif start:
        match_filter["timestamp"] = {"$gte": f"{start}T00:00:00"}

    # Aggregate entries with viscosity data (deduplicated)
    pipeline = [
        {"$match": match_filter},
        {"$sort": {"timestamp": 1}},
        {"$group": {"_id": {"timestamp": "$timestamp", "asset_id": "$asset_id"}, "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$sort": {"timestamp": 1}},
        {"$project": {"_id": 0}},
    ]
    entries = await db.production_logs.aggregate(pipeline).to_list(5000)

    if len(entries) < 3:
        return {"status": "error", "error": f"Not enough data for analysis in this period (found {len(entries)} entries, need at least 3)"}

    date_range = {"start": start or "all", "end": end or "all"}

    # Compute per-day aggregates
    days = {}
    for e in entries:
        m = e.get("metrics", {})
        try:
            visc = float(e["mooney_viscosity"])
        except (ValueError, TypeError):
            continue

        date = e.get("timestamp", "")[:10]
        if date not in days:
            days[date] = {"viscosities": [], "rpms": [], "feeds": [], "moistures": [],
                          "mt1s": [], "mt2s": [], "mt3s": [], "energies": [],
                          "mp1s": [], "mp4s": [], "waste": 0, "material": ""}

        days[date]["viscosities"].append(visc)
        try: days[date]["rpms"].append(float(m.get("RPM", 0) or 0))
        except: pass
        try: days[date]["feeds"].append(float(m.get("FEED", 0) or 0))
        except: pass
        try:
            moist = float(m.get("M%", 0) or 0)
            if 0 < moist < 1:
                moist = round(moist * 100, 1)
            if moist > 0:
                days[date]["moistures"].append(moist)
        except: pass
        try: days[date]["energies"].append(float(m.get("ENERGY", 0) or 0))
        except: pass
        try: days[date]["mt1s"].append(float(m.get("MT1", 0) or 0))
        except: pass
        try: days[date]["mt2s"].append(float(m.get("MT2", 0) or 0))
        except: pass
        try: days[date]["mt3s"].append(float(m.get("MT3", 0) or 0))
        except: pass
        try: days[date]["mp1s"].append(float(m.get("MP1", 0) or 0))
        except: pass
        try: days[date]["mp4s"].append(float(m.get("MP4", 0) or 0))
        except: pass

        waste = e.get("total_waste")
        if waste:
            try: days[date]["waste"] = float(waste)
            except: pass
        mat = e.get("input_material")
        if mat:
            days[date]["material"] = mat

    # Build daily summaries
    daily_summaries = []
    all_visc = []
    good_days = []  # days where avg viscosity is 50-60 and RSD < 5
    bad_days = []

    for date, d in sorted(days.items()):
        if not d["viscosities"]:
            continue
        avg_visc = statistics.mean(d["viscosities"])
        visc_std = statistics.stdev(d["viscosities"]) if len(d["viscosities"]) > 1 else 0
        rsd = (visc_std / avg_visc * 100) if avg_visc > 0 else 0
        avg_rpm = statistics.mean(d["rpms"]) if d["rpms"] else 0
        avg_feed = statistics.mean(d["feeds"]) if d["feeds"] else 0
        avg_moist = statistics.mean(d["moistures"]) if d["moistures"] else 0
        avg_mt1 = statistics.mean(d["mt1s"]) if d["mt1s"] else 0
        avg_mt2 = statistics.mean(d["mt2s"]) if d["mt2s"] else 0
        avg_mt3 = statistics.mean(d["mt3s"]) if d["mt3s"] else 0
        avg_energy = statistics.mean(d["energies"]) if d["energies"] else 0

        in_range = 50 <= avg_visc <= 60
        low_rsd = rsd < 5

        summary = {
            "date": date, "samples": len(d["viscosities"]),
            "avg_visc": round(avg_visc, 2), "rsd": round(rsd, 2),
            "avg_rpm": round(avg_rpm, 1), "avg_feed": round(avg_feed, 1),
            "avg_moisture": round(avg_moist, 3), "avg_energy": round(avg_energy, 2),
            "avg_mt1": round(avg_mt1, 1), "avg_mt2": round(avg_mt2, 1), "avg_mt3": round(avg_mt3, 1),
            "waste": d["waste"], "material": d["material"],
            "in_target": in_range, "low_rsd": low_rsd,
        }
        daily_summaries.append(summary)
        all_visc.extend(d["viscosities"])

        if in_range and low_rsd:
            good_days.append(summary)
        elif not in_range or rsd > 7:
            bad_days.append(summary)

    # Compute overall stats
    overall_avg = statistics.mean(all_visc) if all_visc else 0
    overall_std = statistics.stdev(all_visc) if len(all_visc) > 1 else 0
    in_target_pct = sum(1 for v in all_visc if 50 <= v <= 60) / len(all_visc) * 100 if all_visc else 0

    # Sort good days by RSD (best first)
    good_days.sort(key=lambda x: x["rsd"])
    bad_days.sort(key=lambda x: abs(x["avg_visc"] - 55), reverse=True)

    # Build GPT prompt
    good_text = "\n".join([
        f"  {d['date']}: Visc={d['avg_visc']}MU RSD={d['rsd']}% RPM={d['avg_rpm']} Feed={d['avg_feed']} M%(MotorTorque)={d['avg_moisture']} MT1={d['avg_mt1']} MT2={d['avg_mt2']} MT3={d['avg_mt3']} Waste={d['waste']}kg"
        for d in good_days[:30]
    ])
    bad_text = "\n".join([
        f"  {d['date']}: Visc={d['avg_visc']}MU RSD={d['rsd']}% RPM={d['avg_rpm']} Feed={d['avg_feed']} M%(MotorTorque)={d['avg_moisture']} MT1={d['avg_mt1']} MT2={d['avg_mt2']} MT3={d['avg_mt3']} Waste={d['waste']}kg"
        for d in bad_days[:20]
    ])

    range_desc = f"from {start} to {end}" if start and end else "all historical data"
    prompt = f"""You are analyzing production data for a Line-90 rubber compound extruder ({range_desc}) to determine OPTIMAL MACHINE SETTINGS.

OVERALL STATISTICS ({len(all_visc)} samples across {len(daily_summaries)} production days, period: {range_desc}):
- Mean Viscosity: {overall_avg:.2f} MU (target: 50-60 MU)
- Std Dev: {overall_std:.2f} MU
- In Target Range: {in_target_pct:.1f}%
- Total production days analyzed: {len(daily_summaries)}
- Good days (visc 50-60 & RSD<5%): {len(good_days)}
- Problematic days: {len(bad_days)}

BEST PERFORMING DAYS (viscosity in range, low variation):
{good_text}

WORST PERFORMING DAYS (out of range or high variation):
{bad_text}

CONTROLLABLE INPUTS: RPM, Feed rate (kg/h), M% (Motor Torque percentage, shown as 80-90 not 0.80-0.90), MT1/MT2/MT3 (temperatures)
QUALITY OUTCOMES: Mooney Viscosity (target 50-60 MU), RSD (target <5%), Waste (minimize)

Analyze the data and provide:

1. **optimal_settings**: The recommended settings for each controllable input (RPM, Feed, M% (Motor Torque), MT1, MT2, MT3) with specific values and acceptable ranges.

2. **key_findings**: 3-5 key statistical findings about what drives good vs bad days. Be specific with numbers.

3. **correlations**: What input parameters most strongly correlate with viscosity being in/out of target range?

4. **risk_factors**: Settings combinations that tend to produce out-of-spec results.

5. **improvement_recommendations**: 3-5 specific, actionable recommendations to improve the {100-in_target_pct:.1f}% of samples currently out of target.

Return ONLY valid JSON with this structure:
{{
  "optimal_settings": {{
    "RPM": {{"recommended": 165, "range": [160, 170], "unit": "rpm"}},
    "Feed": {{"recommended": 520, "range": [500, 540], "unit": "kg/h"}},
    "Motor_Torque": {{"recommended": 85, "range": [80, 90], "unit": "%"}},
    "MT1": {{"recommended": 210, "range": [200, 220], "unit": "°C"}},
    "MT2": {{"recommended": 168, "range": [160, 175], "unit": "°C"}},
    "MT3": {{"recommended": 155, "range": [145, 165], "unit": "°C"}}
  }},
  "key_findings": ["finding1", "finding2", ...],
  "correlations": ["correlation1", "correlation2", ...],
  "risk_factors": ["risk1", "risk2", ...],
  "improvement_recommendations": ["rec1", "rec2", ...],
  "summary": "2-3 sentence executive summary"
}}"""

    try:
        messages = [
            {"role": "system", "content": "You are an expert production engineer and data scientist specializing in rubber compound extrusion and Mooney viscosity optimization. Analyze the data rigorously and provide specific, actionable recommendations. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ]

        response = await chat_completion(
            messages=messages,
            model="gpt-4o",
            temperature=0.3
        )

        # Parse JSON response
        import json as json_module
        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        analysis = json_module.loads(clean)

        # Save analysis to DB
        analysis_doc = {
            "id": str(uuid.uuid4()),
            "type": "machine_analysis",
            "equipment": EQUIPMENT_NAME,
            "analysis": analysis,
            "date_range": date_range,
            "stats": {
                "total_samples": len(all_visc),
                "total_days": len(daily_summaries),
                "good_days": len(good_days),
                "bad_days": len(bad_days),
                "in_target_pct": round(in_target_pct, 1),
                "avg_viscosity": round(overall_avg, 2),
                "std_viscosity": round(overall_std, 2),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"],
        }
        await db.production_analyses.insert_one(analysis_doc)
        analysis_doc.pop("_id", None)

        return {"status": "ok", "analysis": analysis, "stats": analysis_doc["stats"], "date_range": date_range}

    except Exception as e:
        logger.error(f"Machine analysis failed: {e}")
        return {"status": "error", "error": str(e)}


@router.get("/production/machine-analysis")
async def get_latest_analysis(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get the most recent machine analysis, optionally filtered by date range."""
    query = {"type": "machine_analysis"}
    if start and end:
        query["date_range.start"] = start
        query["date_range.end"] = end

    doc = await db.production_analyses.find_one(
        query,
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    if not doc:
        return {"status": "empty", "analysis": None}
    return {"status": "ok", "analysis": doc.get("analysis"), "stats": doc.get("stats"), "created_at": doc.get("created_at"), "date_range": doc.get("date_range")}
