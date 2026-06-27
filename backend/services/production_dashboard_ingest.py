"""
Production dashboard ingest — merge production_logs and assemble final payload.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from database import db
from services.tenant_schema import prepend_tenant_match
from services.production_helpers import (
    EQUIPMENT_NAME,
    WASTE_ENTRY_WEIGHT_ALERT_KG,
    _serialize_datetime,
    _sort_key_dt,
    _in_any_time_window,
    _sum_waste_reporting_kg,
)
from services.production_dashboard_scope import ProductionDashboardScope

logger = logging.getLogger(__name__)


async def merge_production_dashboard_ingest(
    scope: ProductionDashboardScope,
    form_data: Dict[str, Any],
) -> Dict[str, Any]:
    submissions = form_data["submissions"]
    extruder_subs = form_data["extruder_subs"]
    big_bag_subs = form_data["big_bag_subs"]
    screen_change_subs = form_data["screen_change_subs"]
    magnet_subs = form_data["magnet_subs"]
    end_of_shift_subs = form_data["end_of_shift_subs"]
    waste_reporting_subs = form_data["waste_reporting_subs"]
    production_log = form_data["production_log"]
    total_feed = form_data["total_feed"]
    viscosity_values = form_data["viscosity_values"]
    big_bag_entries = form_data["big_bag_entries"]
    information_entries = form_data["information_entries"]
    end_of_shift_entries = form_data["end_of_shift_entries"]
    waste_reporting_entries = form_data["waste_reporting_entries"]
    viscosity_series = form_data["viscosity_series"]
    lot_info = form_data["lot_info"]
    actions = form_data["actions"]
    insights = form_data["insights"]

    # ── ALWAYS merge ingested production_logs data (not just as fallback) ──
    # This allows data uploaded via Log Ingestion to show alongside form submissions.
    ingested_asset_match = [{"asset_id": {"$regex": "line.?90", "$options": "i"}}]
    _ingest_exact = sorted(t for t in scope.line90_subtree_asset_tokens if t and len(t) <= 200)
    if _ingest_exact:
        ingested_asset_match.append({"asset_id": {"$in": _ingest_exact[:200]}})
    # Ingestion stores missing mapping as "unknown" or leaves field empty
    ingested_asset_match.extend([
        {"asset_id": "unknown"},
        {"asset_id": None},
        {"asset_id": ""},
        {"asset_id": {"$exists": False}},
    ])
    # String range on timestamp misses some stored shapes (e.g. space instead of T). Use calendar-day
    # regex fallbacks, then tighten to shift window when appending rows below.
    _ingest_dates = []
    _scan_d = scope.range_start.date()
    _end_d = scope.range_end.date()
    while _scan_d <= _end_d and len(_ingest_dates) < 45:
        _ingest_dates.append(_scan_d.strftime("%Y-%m-%d"))
        _scan_d += timedelta(days=1)
    ingested_ts_match = [
        {
            "timestamp": {
                "$gte": scope.range_start.strftime("%Y-%m-%dT%H:%M:%S"),
                "$lte": scope.range_end.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        },
    ]
    for _ds in _ingest_dates:
        ingested_ts_match.append({"timestamp": {"$regex": f"^{re.escape(_ds)}"}})
    ingested_query = {
        "$and": [
            {"$or": ingested_asset_match},
            {"$or": ingested_ts_match},
        ]
    }
    # Deduplicate: prefer entries with mooney_viscosity
    pipeline = prepend_tenant_match([
        {"$match": ingested_query},
        {"$addFields": {"_has_visc": {"$cond": [{"$gt": [{"$ifNull": ["$mooney_viscosity", ""]}, ""]}, 1, 0]}}},
        {"$sort": {"timestamp": 1, "_has_visc": -1}},
        {"$group": {"_id": "$timestamp", "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$sort": {"timestamp": 1}},
        {"$project": {"_id": 0, "_has_visc": 0}},
    ], scope.current_user)
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
            ts_dt = None
            if ts:
                try:
                    ts_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    if ts_dt.tzinfo is None:
                        ts_dt = ts_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    ts_dt = None
            if ts_dt is None:
                continue
            if not _in_any_time_window(ts_dt, scope.filter_windows):
                continue

            time_label = ts_dt.strftime("%H:%M")

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
                "datetime": _serialize_datetime(ts_dt),
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
                        "datetime": _serialize_datetime(ts_dt),
                        "viscosity": visc_val,
                        "sample": entry.get("sample_id", ""),
                        "submission_id": entry.get("id", ""),
                    })
                except (ValueError, TypeError):
                    pass

            # Magnet cleaning — detect from clean_magnet_status or clean_magnet_time
            magnet_status = str(entry.get("clean_magnet_status") or "").strip().lower()
            magnet_time_val = entry.get("clean_magnet_time")
            has_magnet = (
                magnet_status in ("done", "ok", "yes")
                or (magnet_status and ":" in magnet_status)  # time value like "06:30:00"
                or (magnet_time_val and str(magnet_time_val).strip())
            )
            if has_magnet:
                magnet_subs.append({"_parsed_time": ts_dt})

            # Screen changes — detect from status/remarks text
            status_text = str(entry.get("status") or "").lower()
            if "screen" in status_text and "change" in status_text:
                screen_change_subs.append({"_parsed_time": ts_dt})

            # Input material → big bag entries
            if entry.get("input_material"):
                big_bag_entries.append({
                    "time": time_label,
                    "datetime": _serialize_datetime(ts_dt),
                    "material": entry.get("input_material", ""),
                    "supplier": entry.get("supplier", ""),
                    "bag_no": entry.get("bag_no", ""),
                    "lot_no": entry.get("lot_no", ""),
                    "production_date": entry.get("production_date", ""),
                    "equipment_name": entry.get("asset_id") or EQUIPMENT_NAME,
                    "submitted_by": "Log Ingestion",
                    "submission_id": entry.get("id", ""),
                })

        # Update lot_info
        if big_bag_entries and not lot_info:
            lots = [e.get("lot_no", "") for e in big_bag_entries if e.get("lot_no")]
            materials_list = [e.get("material", "") for e in big_bag_entries if e.get("material")]
            if lots:
                lot_info = f"Lot: {lots[0]}"
            if materials_list:
                lot_info += f" {materials_list[0]}" if lot_info else materials_list[0]

    # Order log by time after merging form + ingested rows; rebuild series for charts/KPIs.
    def _parse_entry_dt(entry):
        raw = entry.get("datetime") or ""
        if not raw:
            return datetime.min
        try:
            d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            # Keep naive datetimes naive; convert aware → UTC naive for stable sorting.
            return _sort_key_dt(d)
        except Exception:
            return datetime.min

    production_log.sort(key=_parse_entry_dt)
    big_bag_entries.sort(key=_parse_entry_dt)

    avg_viscosity = (
        round(sum(viscosity_values) / len(viscosity_values), 2) if viscosity_values else 0
    )
    if len(viscosity_values) > 1 and avg_viscosity > 0:
        mean_v = avg_viscosity
        variance_v = sum((v - mean_v) ** 2 for v in viscosity_values) / (len(viscosity_values) - 1)
        rsd = round((variance_v ** 0.5 / mean_v) * 100, 2)
    else:
        rsd = 0

    waste_downtime_series = []
    for entry in production_log:
        waste_downtime_series.append({
            "time": entry["time"],
            "waste": entry.get("waste", 0),
            "downtime": 0,
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
        })

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

    if len(production_log) >= 2:
        try:
            t1 = _parse_entry_dt(production_log[0])
            t2 = _parse_entry_dt(production_log[-1])
            runtime_hours = round((t2 - t1).total_seconds() / 3600, 2)
        except Exception:
            runtime_hours = round(len(production_log) * 0.25, 2)
    else:
        runtime_hours = round(len(production_log) * 0.25, 2) if production_log else 0

    # Total input from End of Shift when available (waste KPI uses Waste reporting table below).
    if end_of_shift_entries:
        total_feed = sum(float(e.get("total_input") or 0) for e in end_of_shift_entries)

    waste_kg = _sum_waste_reporting_kg(waste_reporting_entries)
    waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 and waste_kg > 0 else 0
    yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

    # Viscosity range string
    visc_range_str = "55-60"
    if viscosity_values:
        visc_range_str = f"{min(viscosity_values):.1f}-{max(viscosity_values):.1f}"

    if not production_log:
        logger.warning(
            "Production dashboard: empty production_log (scope.all_subs=%s submissions=%s extruder=%s ingested=%s range=%s–%s)",
            len(scope.all_subs),
            len(submissions),
            len(extruder_subs),
            len(ingested),
            scope.range_start.isoformat(),
            scope.range_end.isoformat(),
        )

    payload = {
        "date": scope.target_date.strftime("%Y-%m-%d"),
        "from_date": scope.range_start.strftime("%Y-%m-%d"),
        "to_date": scope.range_end.strftime("%Y-%m-%d"),
        "scope.is_range": scope.is_range,
        "shift": scope.shift_param,
        "shifts": scope.shift_keys,
        "scope.shift_label": scope.shift_label,
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
            "scope.shift_hours": scope.shift_hours,
            "sample_count": len(production_log),
            "viscosity_sample_count": len(viscosity_values),
            "waste_reporting_count": len(waste_reporting_entries),
        },
        "production_log": production_log,
        "waste_downtime_series": waste_downtime_series,
        "scatter_data": scatter_data,
        "viscosity_series": viscosity_series,
        "viscosity_values": viscosity_values,
        "big_bag_entries": big_bag_entries,
        "information_entries": information_entries,
        "end_of_shift_entries": end_of_shift_entries,
        "waste_reporting_entries": waste_reporting_entries,
        "waste_weight_threshold_kg": WASTE_ENTRY_WEIGHT_ALERT_KG,
        "screen_changes": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else "", "datetime": s.get("_parsed_time").isoformat() if s.get("_parsed_time") else ""} for s in screen_change_subs],
        "magnet_cleanings": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else "", "datetime": s.get("_parsed_time").isoformat() if s.get("_parsed_time") else ""} for s in magnet_subs],
        "actions": actions,
        "insights": insights,
        "submissions_count": len(submissions),
    }
    return payload

