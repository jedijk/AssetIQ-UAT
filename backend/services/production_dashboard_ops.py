"""Production dashboard auxiliary operations — Wave 8."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import db
import logging

logger = logging.getLogger(__name__)

from services.production_helpers import EQUIPMENT_NAME, _serialize_datetime



# --- Wave 8: production events (non-dashboard GET) ---

async def list_production_events(
    date: Optional[str] = None,
    event_type: Optional[str] = None,
):
    """Get production events/actions/insights for a given date."""
    query = {}
    if date:
        query["date"] = date
    if event_type:
        query["type"] = event_type

    events = await db.production_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"events": events, "total": len(events)}


async def create_production_event(user: dict, data: dict):
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
        "created_by": user["id"],
        "created_by_name": user.get("name", ""),
        "created_at": _serialize_datetime(datetime.now(timezone.utc)),
    }
    await db.production_events.insert_one(event)
    # Remove MongoDB _id before returning
    event.pop("_id", None)
    return event


async def delete_production_event(user: dict, event_id: str):
    """Delete a production event."""
    result = await db.production_events.delete_one({"id": event_id})
    if result.deleted_count == 0:
        return {"error": "Event not found"}
    return {"status": "deleted", "id": event_id}

async def generate_ai_insights(user: dict, data: dict):
    """Generate AI-powered daily insights by analyzing the current production data."""
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

    from services.ai_prompt_registry import render_prompt

    prompt = render_prompt(
        "production.daily_insights.user",
        {
            "date": date,
            "kpi_text": kpi_text,
            "visc_text": visc_text,
            "log_text": log_text,
        },
    )

    try:
        from services.ai_execute_grounded import execute_grounded, overlay_grounded_contract

        grounded = await execute_grounded(
            user=user,
            intent="production_insights",
            query=prompt,
            feature="production.ai_insights",
            prompt_id="production.daily_insights",
            endpoint="production.ai_insights",
            model="gpt-4o",
            temperature=0.7,
            parse_json=True,
            include_fleet=True,
        )
        parsed = grounded.get("parsed")
        if isinstance(parsed, list):
            insights = parsed
        elif isinstance(parsed, dict):
            insights = parsed.get("insights") or parsed.get("recommendations") or []
        else:
            insights = []
        if not isinstance(insights, list) or not insights:
            raise ValueError("AI returned invalid insights JSON")

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
                "created_by": user["id"],
                "created_by_name": "AI",
                "created_at": _serialize_datetime(datetime.now(timezone.utc)),
                "_ai_generated": True,
            }
            await db.production_events.insert_one(event)
            event.pop("_id", None)
            saved.append(event)

        return overlay_grounded_contract(
            {"status": "ok", "insights": saved, "count": len(saved)},
            grounded,
        )

    except Exception as e:
        logger.error(f"AI insights generation failed: {e}")
        return {"status": "error", "error": str(e), "insights": []}


async def generate_machine_analysis(user: dict, data: dict = None):
    """AI-powered analysis of production data to determine optimal machine settings. Accepts optional date range."""
    import statistics
    from services.ai_gateway import user_context

    uid, cid = user_context(user)

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
    from services.ai_prompt_registry import render_prompt

    prompt = render_prompt(
        "production.machine_settings.user",
        {
            "range_desc": range_desc,
            "sample_count": str(len(all_visc)),
            "day_count": str(len(daily_summaries)),
            "overall_avg": f"{overall_avg:.2f}",
            "overall_std": f"{overall_std:.2f}",
            "in_target_pct": f"{in_target_pct:.1f}",
            "good_days_count": str(len(good_days)),
            "bad_days_count": str(len(bad_days)),
            "good_text": good_text,
            "bad_text": bad_text,
            "out_of_target_pct": f"{100 - in_target_pct:.1f}",
        },
    )

    try:
        from services.ai_execute_grounded import execute_grounded, overlay_grounded_contract

        grounded = await execute_grounded(
            user=user,
            intent="machine_analysis",
            query=prompt,
            feature="production.machine_analysis",
            prompt_id="production.machine_settings",
            endpoint="production.machine_analysis",
            model="gpt-4o",
            temperature=0.3,
            parse_json=True,
        )
        analysis = grounded.get("parsed") if isinstance(grounded.get("parsed"), dict) else {}
        if not isinstance(analysis, dict) or not analysis:
            raise ValueError("AI returned invalid machine analysis JSON")

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
            "created_by": user["id"],
        }
        await db.production_analyses.insert_one(analysis_doc)
        analysis_doc.pop("_id", None)

        return overlay_grounded_contract(
            {"status": "ok", "analysis": analysis, "stats": analysis_doc["stats"], "date_range": date_range},
            grounded,
        )

    except Exception as e:
        logger.error(f"Machine analysis failed: {e}")
        return {"status": "error", "error": str(e)}


