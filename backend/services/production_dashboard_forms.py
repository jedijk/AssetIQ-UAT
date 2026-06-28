"""
Production dashboard forms — filter submissions and build form-based entries.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from bson import ObjectId

from database import db
from services.tenant_schema import merge_tenant_filter
from services.tenant_scope import scoped
from services.production_helpers import (
    EQUIPMENT_NAME,
    EXTRUDER_FORM,
    VISCOSITY_FORM,
    BIG_BAG_FORM,
    SCREEN_CHANGE_FORM,
    MAGNET_CLEANING_FORM,
    END_OF_SHIFT_FORM,
    WASTE_REPORTING_FORM,
    INFORMATION_FORM,
    INFORMATION_DASHBOARD_PINNED_FIELD,
    _serialize_datetime,
    _sort_key_dt,
    _in_any_time_window,
    _calendar_day_in_envelope,
    _naive_shift_windows,
    extract_field,
    extract_numeric,
    parse_submitted_at,
    _information_entry_display_time,
    _production_date_raw_for_big_bag,
    _unwrap_form_value,
    _submission_prefill_by_field_id,
    _information_text_from_submission,
    _parse_sample_datetime,
    _extract_date_time_field_raw,
    _extract_waste_reporting_fields,
    _waste_reporting_template_name_matches,
    _information_template_name_matches,
)
from services.production_dashboard_scope import ProductionDashboardScope

logger = logging.getLogger(__name__)


async def build_production_dashboard_forms(scope: ProductionDashboardScope) -> Dict[str, Any]:
    def _tid_str_for_filter(sub):
        tid = sub.get("form_template_id")
        if tid is None:
            return None
        if isinstance(tid, ObjectId):
            return str(tid)
        s = str(tid).strip()
        return s or None

    def _is_big_bag_template_sub(sub) -> bool:
        ts = _tid_str_for_filter(sub)
        if ts and ts in scope.big_bag_tpl_ids_str:
            return True
        tpl = (sub.get("form_template_name") or "").strip().lower()
        return bool(tpl) and ("big" in tpl) and ("bag" in tpl)

    def _is_information_template_sub(sub) -> bool:
        ts = _tid_str_for_filter(sub)
        if ts and ts in scope.information_tpl_ids_str:
            return True
        tpl = (sub.get("form_template_name") or "").strip()
        return _information_template_name_matches(tpl)

    def _prefer_form_sample_time_for_row(sub) -> bool:
        """Extruder + Mooney: sample clock is the Date & Time field, not submitted_at."""
        tpl = (sub.get("form_template_name") or "").strip().lower()
        tid = sub.get("form_template_id")
        ts = str(tid).strip() if tid is not None else ""
        if isinstance(tid, ObjectId):
            ts = str(tid)
        if ts and ts in scope.extruder_tpl_ids_str:
            return True
        if ts and ts in scope.viscosity_tpl_ids_str:
            return True
        if ("extruder" in tpl) and ("setting" in tpl):
            return True
        if ("mooney" in tpl) and (("viscos" in tpl) or ("sample" in tpl)):
            return True
        return False

    # Filter by date range: include if submission time OR sample "Date & Time" falls in shift window.
    # (Using only the form field can drop rows when it parses wrong or defaults outside the window.)
    submissions = []
    for sub in scope.all_subs:
        is_bb = _is_big_bag_template_sub(sub)
        is_info = _is_information_template_sub(sub)

        raw_sample_dt = _extract_date_time_field_raw(sub)
        dt_form = _parse_sample_datetime(raw_sample_dt) if raw_sample_dt else None
        # Big Bag often has no "Date & Time"; use Production Date for shift/day windowing.
        if dt_form is None and is_bb:
            raw_pd = _production_date_raw_for_big_bag(sub)
            if raw_pd is not None and str(raw_pd).strip() and str(raw_pd).strip() not in ("{}", "null"):
                dt_form = _parse_sample_datetime(_unwrap_form_value(raw_pd))

        dt_meta = parse_submitted_at(sub)
        if dt_meta is None and is_bb and dt_form is not None:
            dt_meta = dt_form
        # Information forms are often text-only; fall back to any parsed form clock like Big Bag.
        if dt_meta is None and is_info and dt_form is not None:
            dt_meta = dt_form

        if dt_meta is None:
            continue
        if dt_meta.tzinfo is None:
            dt_meta = dt_meta.replace(tzinfo=timezone.utc)

        in_meta = _in_any_time_window(dt_meta, scope.filter_windows)
        in_form = _in_any_time_window(dt_form, scope.filter_windows) if dt_form else False

        # Big Bag: often no "Date & Time" — only Production Date and/or submitted_at.
        # - Production Date may be date-only (midnight) and miss shift windows.
        # - submitted_at is UTC while shifts are wall-clock; first load of the day (~06:00 local)
        #   can be 04:00 UTC and fall outside a 06:00–14:00 UTC window unless we also match by day.
        if is_bb:
            if dt_form and not in_form and _calendar_day_in_envelope(dt_form, scope.cal_env_start, scope.cal_env_end):
                in_form = True
            if dt_meta and not in_meta:
                dt_wall = dt_meta.replace(tzinfo=None) if dt_meta.tzinfo else dt_meta
                if _in_any_time_window(dt_wall, _naive_shift_windows(scope.filter_windows)):
                    in_meta = True
                elif _calendar_day_in_envelope(dt_meta, scope.cal_env_start, scope.cal_env_end):
                    in_meta = True

        if is_info and dt_form and not in_form:
            if _calendar_day_in_envelope(dt_form, scope.cal_env_start, scope.cal_env_end):
                in_form = True

        if not in_meta and not in_form:
            continue

        # Extruder / Mooney: form Date & Time is authoritative. If it parses and falls OUTSIDE the
        # selected date/shift window, do not attach this row via submission time alone — it would
        # show a historical sample clock (e.g. Nov 2025) on a May 2026 dashboard and sort oddly.
        if _prefer_form_sample_time_for_row(sub) and dt_form is not None and not in_form:
            continue

        # Production log / charts use operator-entered sample time for extruder + Mooney when in-window.
        if _prefer_form_sample_time_for_row(sub) and dt_form is not None:
            sub["_parsed_time"] = dt_form
        elif is_bb:
            if dt_form is not None:
                sub["_parsed_time"] = dt_form
            elif dt_meta is not None:
                sub["_parsed_time"] = dt_meta.replace(tzinfo=None) if dt_meta.tzinfo else dt_meta
            else:
                sub["_parsed_time"] = dt_meta
        else:
            sub["_parsed_time"] = dt_form if in_form else dt_meta
        submissions.append(sub)

    # Separate by form type.
    #
    # Production templates are often versioned / suffixed (e.g. "Extruder Settings v16"),
    # so we match by intent rather than exact equality, while keeping the historical
    # exact-name behavior as a fast path.
    def _tid_str(sub):
        tid = sub.get("form_template_id")
        if tid is None:
            return None
        if isinstance(tid, ObjectId):
            return str(tid)
        s = str(tid).strip()
        return s or None

    def match_template(sub, name: str):
        target = (name or "").strip().lower()
        if not target:
            return False
        ts = _tid_str(sub)
        if ts:
            if target == EXTRUDER_FORM.lower() and ts in scope.extruder_tpl_ids_str:
                return True
            if target == VISCOSITY_FORM.lower() and ts in scope.viscosity_tpl_ids_str:
                return True
            if target == BIG_BAG_FORM.lower() and ts in scope.big_bag_tpl_ids_str:
                return True
            if target == SCREEN_CHANGE_FORM.lower() and ts in scope.screen_tpl_ids_str:
                return True
            if target == MAGNET_CLEANING_FORM.lower() and ts in scope.magnet_tpl_ids_str:
                return True
            if target == END_OF_SHIFT_FORM.lower() and ts in scope.eos_tpl_ids_str:
                return True
            if target == WASTE_REPORTING_FORM.lower() and ts in scope.waste_reporting_tpl_ids_str:
                return True
            if target == INFORMATION_FORM.lower() and ts in scope.information_tpl_ids_str:
                return True
        tpl = (sub.get("form_template_name") or "").strip().lower()
        if not tpl:
            return False
        if tpl == target:
            return True
        if target == EXTRUDER_FORM.lower():
            return ("extruder" in tpl) and ("setting" in tpl)
        if target == VISCOSITY_FORM.lower():
            return ("mooney" in tpl) and (("viscos" in tpl) or ("sample" in tpl))
        if target == BIG_BAG_FORM.lower():
            return ("big" in tpl) and ("bag" in tpl)
        if target == SCREEN_CHANGE_FORM.lower():
            return ("screen" in tpl) and ("change" in tpl)
        if target == MAGNET_CLEANING_FORM.lower():
            return ("magnet" in tpl) and ("clean" in tpl)
        if target == END_OF_SHIFT_FORM.lower():
            return ("end" in tpl) and ("shift" in tpl)
        if target == WASTE_REPORTING_FORM.lower():
            return _waste_reporting_template_name_matches(tpl)
        if target == INFORMATION_FORM.lower():
            return _information_template_name_matches(tpl)
        return False

    extruder_subs = sorted(
        [s for s in submissions if match_template(s, EXTRUDER_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
    )
    viscosity_subs = sorted(
        [s for s in submissions if match_template(s, VISCOSITY_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
    )

    # Lookup for stable pairing when viscosity submissions were auto-paired to a specific
    # extruder submission id.
    extruder_time_by_id = {}
    for sub in extruder_subs:
        sid = sub.get("id")
        dt = sub.get("_parsed_time")
        if sid and dt:
            extruder_time_by_id[sid] = dt
    big_bag_subs = [s for s in submissions if match_template(s, BIG_BAG_FORM)]
    big_bag_subs.sort(key=lambda s: _sort_key_dt(s.get("_parsed_time")))
    information_subs = [s for s in submissions if match_template(s, INFORMATION_FORM)]
    information_subs.sort(key=lambda s: _sort_key_dt(s.get("_parsed_time")))
    # Pinned information rows are stored on the submission and must appear for all users,
    # including when their timestamps fall outside the selected dashboard range.
    try:
        seen_info_ids = {s.get("id") for s in information_subs if s.get("id")}
        pinned_raw = await db.form_submissions.find(
            merge_tenant_filter(
                {"$and": [scope.query, {INFORMATION_DASHBOARD_PINNED_FIELD: True}]},
                scope.current_user,
            ),
            {"_id": 0},
        ).sort([("submitted_at", -1), ("created_at", -1)]).to_list(500)
        for sub in pinned_raw:
            if not _is_information_template_sub(sub):
                continue
            sid = sub.get("id")
            if not sid or sid in seen_info_ids:
                continue
            sub["_parsed_time"] = _information_entry_display_time(sub)
            information_subs.append(sub)
            seen_info_ids.add(sid)
    except Exception as e:
        logger.warning("production dashboard: merge pinned information failed: %s", e)
    information_subs.sort(
        key=lambda s: (
            0 if s.get(INFORMATION_DASHBOARD_PINNED_FIELD) else 1,
            _sort_key_dt(s.get("_parsed_time")),
        )
    )
    screen_change_subs = [s for s in submissions if match_template(s, SCREEN_CHANGE_FORM)]
    magnet_subs = [s for s in submissions if match_template(s, MAGNET_CLEANING_FORM)]
    end_of_shift_subs = sorted(
        [s for s in submissions if match_template(s, END_OF_SHIFT_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
        reverse=True,
    )
    waste_reporting_subs = sorted(
        [s for s in submissions if match_template(s, WASTE_REPORTING_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
        reverse=True,
    )

    # Build production log entries from extruder data
    production_log = []
    # NOTE: total_feed is initialized to 0 and ONLY set from End of Shift entries (see below)
    # Do NOT accumulate from individual FEED values
    total_feed = 0.0

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

        # Do NOT add feed to total_feed - total_input comes ONLY from End of Shift

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
        paired_to = sub.get("auto_paired_to_extruder_id")
        if paired_to and paired_to in extruder_time_by_id:
            dt = extruder_time_by_id[paired_to]
        time_label = dt.strftime("%H:%M") if dt else ""
        measurement = None
        # Be flexible: production Mooney forms differ across versions.
        # Prefer the dedicated "Measurement" field, but accept common variants.
        for key in ("Measurement", "Mooney", "Mooney Viscosity", "Viscosity", "MU"):
            measurement = extract_numeric(sub, key)
            if measurement is not None:
                break
        sample_no = extract_field(sub, "Sample No.")
        if measurement is not None:
            viscosity_values.append(measurement)
            viscosity_entries.append({
                "time": time_label,
                "datetime": _serialize_datetime(dt) if dt else "",
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
        rpd = _production_date_raw_for_big_bag(sub)
        if rpd is not None:
            u = _unwrap_form_value(rpd)
            if isinstance(u, datetime):
                production_date = u.isoformat(sep=" ", timespec="minutes")
            else:
                production_date = str(u).strip() if u not in (None, "") else ""
        else:
            production_date = ""
        equip_label = (sub.get("equipment_name") or "").strip()
        if not equip_label:
            equip_label = EQUIPMENT_NAME
        big_bag_entries.append({
            "time": time_label,
            "datetime": _serialize_datetime(dt) if dt else "",
            "material": material,
            "supplier": supplier,
            "bag_no": bag_no,
            "lot_no": lot_no,
            "production_date": production_date,
            "equipment_name": equip_label,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
        })

    information_entries = []
    for sub in information_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""
        st = parse_submitted_at(sub)
        if st:
            when_iso = _serialize_datetime(st, force_utc=True)
        elif dt:
            when_iso = _serialize_datetime(dt)
        else:
            when_iso = ""
        text = _information_text_from_submission(sub)
        tpl_name = (sub.get("form_template_name") or "").strip()
        ftid = sub.get("form_template_id")
        information_entries.append({
            "time": time_label,
            "datetime": _serialize_datetime(dt) if dt else "",
            "submitted_at": when_iso,
            "text": text,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
            "form_template_name": tpl_name,
            "form_template_id": str(ftid) if ftid is not None else "",
            "prefill": _submission_prefill_by_field_id(sub),
            "pinned": bool(sub.get(INFORMATION_DASHBOARD_PINNED_FIELD)),
        })

    # End of Shift data
    end_of_shift_entries = []
    for sub in end_of_shift_subs:
        dt = sub.get("_parsed_time")
        date_time_raw = extract_field(sub, "Date & Time") or ""
        total_input = extract_numeric(sub, "Total Input")
        # Extract notes/comments for display on hover
        notes = sub.get("notes") or ""
        end_of_shift_entries.append({
            "datetime": _serialize_datetime(dt),
            "date_time_raw": date_time_raw,
            "total_input": total_input if total_input is not None else 0,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
            "notes": notes,
        })

    waste_reporting_entries = []
    for sub in waste_reporting_subs:
        dt = sub.get("_parsed_time")
        date_time_raw, waste_type, weight_kg = _extract_waste_reporting_fields(sub)
        waste_reporting_entries.append({
            "datetime": _serialize_datetime(dt) if dt else "",
            "date_time_raw": date_time_raw,
            "waste_type": waste_type,
            "weight_kg": weight_kg if weight_kg is not None else 0,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
            "prefill": _submission_prefill_by_field_id(sub),
        })

    # Viscosity KPIs filled after form rows and ingested logs are merged (see below).
    rsd = 0
    runtime_hours = 0.0
    waste_downtime_series = []
    scatter_data = []

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
    if scope.is_range:
        event_date_query = {
            "date": {
                "$gte": scope.range_start.strftime("%Y-%m-%d"),
                "$lte": scope.range_end.strftime("%Y-%m-%d"),
            }
        }
    else:
        event_date_query = {"date": scope.target_date.strftime("%Y-%m-%d")}

    actions_query = {**event_date_query, "type": "action"}
    actions = await db.production_events.find(
        scoped(scope.current_user, actions_query), {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    # Dashboard "Information" panel uses form submissions (information_entries), not production_events insights.
    insights: List[dict] = []

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
        "submissions": submissions,
        "extruder_subs": extruder_subs,
        "viscosity_subs": viscosity_subs,
        "big_bag_subs": big_bag_subs,
        "information_subs": information_subs,
        "screen_change_subs": screen_change_subs,
        "magnet_subs": magnet_subs,
        "end_of_shift_subs": end_of_shift_subs,
        "waste_reporting_subs": waste_reporting_subs,
        "production_log": production_log,
        "total_feed": total_feed,
        "viscosity_values": viscosity_values,
        "viscosity_entries": viscosity_entries,
        "big_bag_entries": big_bag_entries,
        "information_entries": information_entries,
        "end_of_shift_entries": end_of_shift_entries,
        "waste_reporting_entries": waste_reporting_entries,
        "viscosity_series": viscosity_series,
        "lot_info": lot_info,
        "actions": actions,
        "insights": insights,
    }
