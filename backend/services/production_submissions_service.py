"""Production submission updates, pins, and viscosity routes."""
from fastapi import HTTPException, Query
from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional, Tuple
import logging
import os
import re
import uuid

from bson import ObjectId
from database import db
from services.production_helpers import (
    _require_owner_or_admin,
    _require_owner,
    _serialize_datetime,
    _sort_key_dt,
    _in_range,
    _information_template_name_matches,
    _waste_reporting_template_name_matches,
    _format_waste_type_label,
    _extract_waste_reporting_fields,
    _sum_waste_reporting_kg,
    _in_any_time_window,
    _normalize_shift_keys,
    _shift_windows_for_day,
    _envelope_windows,
    _calendar_day_in_envelope,
    _naive_shift_windows,
    extract_field,
    extract_numeric,
    parse_submitted_at,
    _information_entry_display_time,
    _submission_is_information_form,
    INFORMATION_DASHBOARD_PINNED_FIELD,
    _production_date_raw_for_big_bag,
    _unwrap_form_value,
    _submission_prefill_by_field_id,
    _information_text_from_submission,
    _parse_sample_datetime,
    _extract_date_time_field_raw,
)

logger = logging.getLogger(__name__)


async def set_production_information_pin(user: dict,
    submission_id: str,
    data: dict,
):
    """Pin or unpin an information form submission on the production dashboard (shared, persisted)."""
    raw = data.get("pinned")
    if raw is None:
        raise HTTPException(status_code=400, detail="Missing 'pinned' (boolean)")
    if isinstance(raw, str):
        pinned = raw.strip().lower() in ("1", "true", "yes", "on")
    else:
        pinned = bool(raw)

    sub = await db.form_submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub and ObjectId.is_valid(submission_id):
        sub = await db.form_submissions.find_one({"_id": ObjectId(submission_id)}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if not await _submission_is_information_form(sub):
        raise HTTPException(status_code=400, detail="Only information form submissions can be pinned here")

    now = _serialize_datetime(datetime.now(timezone.utc))
    fid = sub.get("id")
    if fid:
        match = {"id": fid}
    elif ObjectId.is_valid(submission_id):
        match = {"_id": ObjectId(submission_id)}
    else:
        match = {"id": submission_id}

    result = await db.form_submissions.update_one(
        match,
        {"$set": {INFORMATION_DASHBOARD_PINNED_FIELD: pinned, "updated_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission update failed")
    return {"status": "updated", "id": fid or submission_id, "pinned": pinned}


async def update_production_submission(user: dict,
    submission_id: str,
    data: dict,
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

        # Re-run Mooney → Extruder pairing after edits (measurement, date/time, etc.)
        from services.form_service import FormService
        if FormService.is_mooney_viscosity_submission(sub):
            updated_sub = {**sub, "values": new_values}
            await FormService(db).try_auto_pair_mooney_viscosity(updated_sub)

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


async def create_viscosity_submission(user: dict,
    data: dict,
):
    """
    Create a new Mooney Viscosity form submission.
    Used when adding viscosity to an extruder entry that doesn't have a linked viscosity sample.
    
    Expected data:
    - datetime: ISO datetime string (must match extruder entry's date_&_time)
    - measurement: viscosity value (MU)
    """
    import uuid
    
    datetime_val = data.get("datetime")
    measurement = data.get("measurement")
    
    if not datetime_val or measurement is None:
        raise HTTPException(status_code=400, detail="datetime and measurement are required")
    
    # Find the Mooney Viscosity template (try multiple possible names/IDs)
    visc_template = await db.form_templates.find_one(
        {"name": {"$regex": "^mooney viscosity sample$", "$options": "i"}}
    )
    
    if not visc_template:
        raise HTTPException(status_code=404, detail="Mooney Viscosity template not found")
    
    # Get template ID (could be UUID 'id' or ObjectId '_id')
    template_id = str(visc_template.get("_id")) if visc_template.get("_id") else visc_template.get("id")
    template_name = visc_template.get("name", "Mooney viscosity sample")
    
    # Find Line-90 equipment for consistent equipment assignment
    line90 = await db.equipment_nodes.find_one(
        {"name": {"$regex": "Line.?90", "$options": "i"}}, {"_id": 0, "id": 1, "name": 1}
    )
    equipment_id = line90.get("id") if line90 else ""
    equipment_name = line90.get("name", "Line-90") if line90 else "Line-90"
    
    # Create the form submission
    submission_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    submission = {
        "id": submission_id,
        "form_template_id": template_id,
        "form_template_name": template_name,
        "equipment_id": equipment_id,
        "equipment_name": equipment_name,
        "submitted_by": user.get("id"),
        "submitted_by_name": user.get("name", "Unknown"),
        "submitted_at": now,
        "values": [
            {
                "field_id": "date_&_time",
                "field_label": "date_&_time",
                "field_type": "datetime",
                "value": datetime_val,
            },
            {
                "field_id": "measurement",
                "field_label": "measurement",
                "field_type": "number",
                "value": str(measurement),
            },
        ],
        "created_at": now,
        "updated_at": now,
    }
    from services.tenant_schema import with_tenant_id
    with_tenant_id(submission, user)
    
    await db.form_submissions.insert_one(submission)
    logger.info(f"Created new viscosity submission {submission_id} for datetime {datetime_val}, measurement={measurement}")
    
    from services.form_service import FormService
    await FormService(db).try_auto_pair_mooney_viscosity(submission)
    
    return {
        "status": "created",
        "id": submission_id,
        "datetime": datetime_val,
        "measurement": measurement,
    }


async def viscosity_pairing_status(user: dict,
    date: str = Query(..., description="YYYY-MM-DD"),
):
    """
    Diagnostics for why viscosity pairing shows TBD.
    Returns:
    - extruder times (forms + ingested)
    - viscosity times (forms + ingested)
    - missing viscosity times (extruder time not in viscosity time)
    """
    _require_owner_or_admin(user)

    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_day, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Pull all relevant form submissions (broad query, then filter by extracted Date & Time)
    form_patterns = "|".join([p.replace(" ", "\\s*") for p in PRODUCTION_FORMS])
    query = {"form_template_name": {"$regex": f"^({form_patterns}).*$", "$options": "i"}}
    subs = await db.form_submissions.find(query, {"_id": 0}).to_list(2000)

    def _time_hhmm(sub):
        raw = _extract_date_time_field_raw(sub)
        dt_form = _parse_sample_datetime(raw) if raw else None
        dt = dt_form if dt_form is not None else parse_submitted_at(sub)
        if not dt:
            return None, None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if not (day_start <= dt <= day_end):
            return None, None
        return dt, dt.strftime("%H:%M")

    extruder_form_times = []
    visc_form_times = []
    for s in subs:
        tpl = (s.get("form_template_name") or "").lower()
        dt, hhmm = _time_hhmm(s)
        if not hhmm:
            continue
        if "extruder" in tpl and "setting" in tpl:
            extruder_form_times.append(hhmm)
        if "mooney" in tpl and "viscos" in tpl:
            visc_form_times.append(hhmm)

    # Ingested production logs (Line-90)
    day_start_iso = f"{date}T00:00:00"
    day_end_iso = f"{date}T23:59:59"
    ingested = await db.production_logs.find(
        {"asset_id": {"$regex": "line.?90", "$options": "i"}, "timestamp": {"$gte": day_start_iso, "$lte": day_end_iso}},
        {"_id": 0, "timestamp": 1, "mooney_viscosity": 1},
    ).to_list(5000)
    extruder_ingested_times = []
    visc_ingested_times = []
    for row in ingested:
        ts = row.get("timestamp")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.date() != target_day:
            continue
        hhmm = dt.strftime("%H:%M")
        extruder_ingested_times.append(hhmm)
        if row.get("mooney_viscosity") not in (None, "", "-"):
            visc_ingested_times.append(hhmm)

    extruder_times = sorted(set(extruder_form_times) | set(extruder_ingested_times))
    viscosity_times = sorted(set(visc_form_times) | set(visc_ingested_times))
    missing = [t for t in extruder_times if t not in viscosity_times]

    return {
        "date": date,
        "extruder_times": extruder_times,
        "viscosity_times": viscosity_times,
        "missing_viscosity_times": missing,
        "counts": {
            "extruder_form": len(set(extruder_form_times)),
            "extruder_ingested": len(set(extruder_ingested_times)),
            "visc_form": len(set(visc_form_times)),
            "visc_ingested": len(set(visc_ingested_times)),
        },
    }


async def repair_viscosity_pairing(user: dict,
    date: str = Query(..., description="YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Re-run viscosity auto-pairing for already-submitted Mooney samples on a given day.
    Useful when pairing logic changed or ingestion/form timing was off.
    """
    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_day, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Find Mooney viscosity submissions broadly (including versioned template names)
    visc_subs = await db.form_submissions.find(
        {"form_template_name": {"$regex": r"mooney.*(viscos|sample)", "$options": "i"}},
        {"_id": 0},
    ).to_list(2000)

    def _extract_dt_for_filter(sub):
        raw = _extract_date_time_field_raw(sub)
        dt_form = _parse_sample_datetime(raw) if raw else None
        dt = dt_form if dt_form is not None else parse_submitted_at(sub)
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    # Only keep those whose effective datetime is on the target day
    day_visc = []
    for s in visc_subs:
        dt = _extract_dt_for_filter(s)
        if not dt:
            continue
        if day_start <= dt <= day_end:
            day_visc.append(s)

    # Pair in chronological order (stable)
    day_visc.sort(key=lambda s: (_extract_dt_for_filter(s) or day_start))
    day_visc = day_visc[:limit]

    from services.form_service import FormService
    svc = FormService(db)

    repaired = 0
    paired = []
    skipped = []
    for s in day_visc:
        try:
            await svc._auto_pair_viscosity_to_extruder(s)
            repaired += 1
            updated = await db.form_submissions.find_one(
                {"id": s.get("id")},
                {"_id": 0, "id": 1, "auto_paired_to_extruder_id": 1},
            )
            paired_to = (updated or {}).get("auto_paired_to_extruder_id")
            if paired_to:
                paired.append({"visc_id": s.get("id"), "paired_to": paired_to})
            else:
                skipped.append({"visc_id": s.get("id"), "reason": "no_pair"})
        except Exception as e:
            logger.warning(f"Repair viscosity pairing failed for {str(s.get('id',''))[:8]}: {e}")
            skipped.append({"visc_id": s.get("id"), "reason": f"error:{e}"})

    return {
        "date": date,
        "processed": len(day_visc),
        "attempted_repairs": repaired,
        "paired": paired,
        "skipped": skipped,
    }


async def viscosity_pairing_debug_report(user: dict,
    date: str = Query(..., description="YYYY-MM-DD"),
):
    """
    Generate a detailed pairing report for analysis (authenticated users).
    Includes:
    - extruder slots (forms + ingested)
    - viscosity slots (forms + ingested)
    - how the API would key each item (HH:MM)
    - which extruder slots are missing viscosity
    """
    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_day, datetime.max.time()).replace(tzinfo=timezone.utc)

    # --- Form submissions ---
    subs = await db.form_submissions.find(
        {"form_template_name": {"$regex": r"(extruder.*setting|mooney.*(viscos|sample))", "$options": "i"}},
        {"_id": 0},
    ).to_list(5000)

    def _extract_form_dt_raw(sub):
        # Prefer the canonical Date & Time lookup used by the production dashboard,
        # but fall back to any "datetime-like" field label/id so we still report what
        # the operator entered even if the label differs (e.g. "Datetime").
        raw = extract_field(sub, "Date & Time")
        if raw:
            return raw, "Date & Time"

        for v in sub.get("values", []) or []:
            label = str(v.get("field_label") or "").strip().lower()
            fid = str(v.get("field_id") or "").strip().lower()
            is_dt_like = (
                ("date" in label and "time" in label)
                or ("date/time" in label)
                or ("datetime" in label)
                or (fid.replace("_", " ").strip() == "date & time")
                or (fid == "date_&_time")
            )
            if is_dt_like and v.get("value"):
                return v.get("value"), f"values:{v.get('field_label') or v.get('field_id')}"
        return None, None

    def _parse_dt(raw):
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except Exception:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _effective_dt(sub):
        # "Effective dt" is what the report code will key on. This is based on the
        # form-entered Date & Time when present; otherwise it falls back to submitted_at.
        raw, _src = _extract_form_dt_raw(sub)
        dt = _parse_dt(raw) if raw else parse_submitted_at(sub)
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _measurement(sub):
        # mirrors the flexible extraction in the dashboard route
        for key in ("Measurement", "Mooney", "Mooney Viscosity", "Viscosity", "MU"):
            v = extract_numeric(sub, key)
            if v is not None:
                return v, key
        return None, None

    extruder_forms = []
    viscosity_forms = []
    for s in subs:
        dt = _effective_dt(s)
        if not dt or not (day_start <= dt <= day_end):
            continue
        hhmm = dt.strftime("%H:%M")
        tpl = (s.get("form_template_name") or "").strip()
        sid = s.get("id", "")
        ftid = s.get("form_template_id")
        ftid_type = type(ftid).__name__ if ftid is not None else None
        form_dt_raw, form_dt_src = _extract_form_dt_raw(s)
        form_dt_parsed = _parse_dt(form_dt_raw)

        if ("extruder" in tpl.lower()) and ("setting" in tpl.lower()):
            extruder_forms.append({
                "source": "form",
                "id": sid,
                "form_template_id": str(ftid) if ftid is not None else None,
                "form_template_id_type": ftid_type,
                "template": tpl,
                "hhmm": hhmm,
                "datetime": _serialize_datetime(dt),
                "form_date_time_raw": form_dt_raw,
                "form_date_time_source": form_dt_src,
                "form_date_time_parsed": _serialize_datetime(form_dt_parsed) if form_dt_parsed else "",
                "submitted_at": str(s.get("submitted_at") or ""),
            })
        if ("mooney" in tpl.lower()) and (("viscos" in tpl.lower()) or ("sample" in tpl.lower())):
            meas, meas_key = _measurement(s)
            viscosity_forms.append({
                "source": "form",
                "id": sid,
                "form_template_id": str(ftid) if ftid is not None else None,
                "form_template_id_type": ftid_type,
                "template": tpl,
                "hhmm": hhmm,
                "datetime": _serialize_datetime(dt),
                "form_date_time_raw": form_dt_raw,
                "form_date_time_source": form_dt_src,
                "form_date_time_parsed": _serialize_datetime(form_dt_parsed) if form_dt_parsed else "",
                "measurement": meas,
                "measurement_field": meas_key,
                "auto_paired_to_extruder_id": s.get("auto_paired_to_extruder_id"),
                "submitted_at": str(s.get("submitted_at") or ""),
            })

    # --- Ingested production logs ---
    day_start_iso = f"{date}T00:00:00"
    day_end_iso = f"{date}T23:59:59"
    ingested = await db.production_logs.find(
        {"asset_id": {"$regex": "line.?90", "$options": "i"}, "timestamp": {"$gte": day_start_iso, "$lte": day_end_iso}},
        {"_id": 0, "id": 1, "timestamp": 1, "mooney_viscosity": 1},
    ).to_list(5000)

    extruder_ingested = []
    viscosity_ingested = []
    for row in ingested:
        ts = row.get("timestamp")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.date() != target_day:
            continue
        hhmm = dt.strftime("%H:%M")
        extruder_ingested.append({
            "source": "ingested",
            "id": row.get("id", ""),
            "hhmm": hhmm,
            "datetime": _serialize_datetime(dt),
            "timestamp": ts,
        })
        if row.get("mooney_viscosity") not in (None, "", "-"):
            viscosity_ingested.append({
                "source": "ingested",
                "id": row.get("id", ""),
                "hhmm": hhmm,
                "datetime": _serialize_datetime(dt),
                "timestamp": ts,
                "measurement": row.get("mooney_viscosity"),
            })

    extruder_slots = sorted(extruder_forms + extruder_ingested, key=lambda x: (x.get("hhmm") or ""))
    viscosity_slots = sorted(viscosity_forms + viscosity_ingested, key=lambda x: (x.get("hhmm") or ""))

    extruder_times = sorted({s["hhmm"] for s in extruder_slots if s.get("hhmm")})
    viscosity_times = sorted({s["hhmm"] for s in viscosity_slots if s.get("hhmm")})
    missing = [t for t in extruder_times if t not in viscosity_times]

    # Include the exact payload the report page uses (single-day mode).
    # Keep sizes bounded so the downloaded JSON stays usable.
    try:
        report_payload = await get_production_dashboard(
            date=date,
            from_date=None,
            to_date=None,
            shift="day",
            user=user,
        )
    except Exception as e:
        report_payload = {"error": f"Failed to generate report payload: {e}"}

    def _clip_list(v, limit=250):
        if not isinstance(v, list):
            return v
        return v[:limit]

    if isinstance(report_payload, dict):
        report_payload_clipped = dict(report_payload)
        for k in ("production_log", "viscosity_series", "big_bag_entries", "information_entries", "end_of_shift_entries", "actions", "insights"):
            if k in report_payload_clipped:
                report_payload_clipped[k] = _clip_list(report_payload_clipped.get(k))
    else:
        report_payload_clipped = report_payload

    # Add a dry-run pairing probe for each viscosity form submission in the report.
    pairing_probe = {}
    try:
        from services.form_service import FormService
        svc = FormService(db)
        for v in viscosity_forms[:20]:
            vid = v.get("id")
            if not vid:
                continue
            sub = await db.form_submissions.find_one({"id": vid}, {"_id": 0})
            if not sub:
                continue
            pairing_probe[vid] = await svc._auto_pair_viscosity_to_extruder(sub, dry_run=True)
    except Exception as e:
        pairing_probe = {"error": str(e)}

    return {
        "report_version": 2,
        "generated_at": _serialize_datetime(datetime.now(timezone.utc)),
        "date": date,
        "counts": {
            "extruder_forms": len(extruder_forms),
            "extruder_ingested": len(extruder_ingested),
            "viscosity_forms": len(viscosity_forms),
            "viscosity_ingested": len(viscosity_ingested),
            "missing_times": len(missing),
        },
        "missing_viscosity_times": missing,
        "extruder_slots": extruder_slots,
        "viscosity_slots": viscosity_slots,
        "report_page_payload": report_payload_clipped,
        "pairing_probe": pairing_probe,
    }
