"""
Seed sample production data for the Production Dashboard from the real Excel export.
Date: 2 April 2026, Line-90.

Usage:
  python scripts/seed_production_data.py          # Seed data for the real date (2026-04-02)
  python scripts/seed_production_data.py 2026-04-13  # Seed data for a custom date

To clear seeded data:
  curl -X DELETE "$API_URL/api/production/seed-data" -H "Authorization: Bearer $TOKEN"
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# ── Real data from Production_Log_02-04-26.xlsx ──

HEADER_INFO = {
    "date": "2026-04-02",
    "input_material": "Type 2 DG 0,7-1,75",
    "supplier": "VS",
    "total_input": 7260,
    "waste": 592,  # 320+272
    "start_production": "06:00",
    "end_production": "22:00",
    "run_purpose": "Operator shift a+b",
}

# Production log rows: TIME, RPM, FEED, M%, ENERGY, MT1, MT2, MT3, MP1, MP2, MP3, MP4, CO2 Feed/P, T Product IR, REMARKS
PRODUCTION_LOG = [
    {"time": "08:15", "rpm": 165, "feed": 520, "m_pct": 0.86, "energy": 0.262, "mt1": 213, "mt2": 168, "mt3": 154, "mp1": None, "mp2": 19, "mp3": 13, "mp4": 23, "co2_feed_p": "142.6/100", "t_product_ir": 189, "remarks": ""},
    {"time": "09:15", "rpm": 165, "feed": 520, "m_pct": 0.86, "energy": 0.265, "mt1": 210, "mt2": 167, "mt3": 154, "mp1": None, "mp2": 18, "mp3": 15, "mp4": 23, "co2_feed_p": "147.7/100", "t_product_ir": 191, "remarks": "SC1 09:00"},
    {"time": "10:45", "rpm": 165, "feed": 520, "m_pct": 0.86, "energy": 0.274, "mt1": 221, "mt2": 168, "mt3": 155, "mp1": None, "mp2": 17, "mp3": 14, "mp4": 23, "co2_feed_p": "147.9/100", "t_product_ir": 208, "remarks": ""},
    {"time": "11:45", "rpm": 165, "feed": 520, "m_pct": 0.86, "energy": 0.269, "mt1": 215, "mt2": 168, "mt3": 154, "mp1": None, "mp2": 17, "mp3": 14, "mp4": 23, "co2_feed_p": "148.1/100", "t_product_ir": 188, "remarks": "12:15 SC2"},
    {"time": "16:30", "rpm": 160, "feed": 500, "m_pct": 0.84, "energy": 0.263, "mt1": 204, "mt2": 168, "mt3": 152, "mp1": None, "mp2": 17, "mp3": 14, "mp4": 24, "co2_feed_p": "148.1/100", "t_product_ir": 190, "remarks": "B2-3 170C and B4 140C (FvO)"},
    {"time": "18:45", "rpm": 165, "feed": 520, "m_pct": 0.81, "energy": 0.253, "mt1": 209, "mt2": 168, "mt3": 159, "mp1": None, "mp2": 16, "mp3": 13, "mp4": 24, "co2_feed_p": "0", "t_product_ir": 205, "remarks": "SC1 14:45"},
    {"time": "20:30", "rpm": 165, "feed": 520, "m_pct": 0.81, "energy": 0.210, "mt1": 210, "mt2": 168, "mt3": 156, "mp1": None, "mp2": 19, "mp3": 13, "mp4": 23, "co2_feed_p": "148.1/100", "t_product_ir": 193, "remarks": "Reduced to 500/160 - Sheet breaking. Increased at 16:43 to 165/520. SC 17:20. SC3 19:30"},
]

# Mooney viscosity samples (from Sample List sheet)
VISCOSITY_SAMPLES = [
    {"time": "08:15", "sample_no": "165-520-23-189", "value": 55.43},
    {"time": "09:15", "sample_no": "165-520-23-191", "value": 58.90},
    {"time": "10:45", "sample_no": "165-520-23-208", "value": 53.23},
    {"time": "11:45", "sample_no": "165-520-23-188", "value": 59.02},
    {"time": "16:30", "sample_no": "160-500-24-190", "value": 51.28},
    {"time": "18:45", "sample_no": "165-520-24-205", "value": 58.19},
    {"time": "20:30", "sample_no": "165-520-23-193", "value": 57.90},
]

# Big Bag Loading entries
BIG_BAG_ENTRIES = [
    {"bag_no": "11", "lot_no": "26 L", "production_date": "2026-03-17"},
    {"bag_no": "5", "lot_no": "26 L", "production_date": "2026-03-17"},
    {"bag_no": "1", "lot_no": "26/L", "production_date": "2026-03-17"},
    {"bag_no": "12", "lot_no": "26/L", "production_date": "2026-03-17"},
    {"bag_no": "20", "lot_no": "26/L", "production_date": "2026-03-17"},
    {"bag_no": "23", "lot_no": "26/l", "production_date": "2026-03-17"},
    {"bag_no": "8", "lot_no": "26/l", "production_date": "2026-03-17"},
]

# Screen changes (from remarks)
SCREEN_CHANGES = ["09:00", "12:15", "14:45", "17:20", "19:30"]

# Magnet cleaning (from dedicated section)
MAGNET_CLEANINGS = ["14:05", "14:45"]

# Events / actions
EVENTS = [
    {"title": "Sheet breaking + downtime", "description": "Reduced to 500/160 at 16:30, sheet breaking. Increased at 16:43 to 165/520", "type": "action", "severity": "critical", "time": "16:30"},
    {"title": "Linked waste events at 16:30", "description": "Sheet breaking - 120 kg, Downtime - 15 min", "type": "action", "severity": "warning", "time": "16:30"},
    {"title": "Stable operation", "description": "Parameters stable between 08:15-11:45", "type": "action", "severity": "success", "time": "11:50"},
    {"title": "Feed reduction impacted output", "description": "Reduced output: RPM 160, Feed 500 at 16:30", "type": "action", "severity": "info", "time": "16:32"},
    {"title": "Sheet breaking + downtime at 16:30", "description": "120 kg waste + 15 min downtime", "type": "insight", "severity": "critical", "time": "16:35"},
    {"title": "Stable operation", "description": "Parameters stable between 08:15-11:45", "type": "insight", "severity": "success", "time": "11:54"},
    {"title": "Viscosity trending low", "description": "Sample at 16:30 dropped to 51.28 MU (below 55-60 target range)", "type": "insight", "severity": "warning", "time": "17:00"},
]


async def seed_production_data(target_date_str=None):
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    if target_date_str:
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        target_date = datetime.strptime(HEADER_INFO["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)

    date_str = target_date.strftime("%Y-%m-%d")
    print(f"Seeding production data for {date_str}...")

    # Check if seeded data already exists
    existing = await db.form_submissions.count_documents({
        "_seeded": True,
        "submitted_at": {"$regex": f"^{date_str}"}
    })
    if existing > 0:
        print(f"Found {existing} existing seeded submissions for {date_str}. Skipping.")
        print("Use the clear endpoint first: curl -X DELETE \"$API_URL/api/production/seed-data\" -H \"Authorization: Bearer $TOKEN\"")
        client.close()
        return

    # Find equipment
    equipment = await db.equipment_nodes.find_one(
        {"name": {"$regex": "Line.?90", "$options": "i"}},
        {"_id": 0, "id": 1, "name": 1, "tag": 1}
    )
    equipment_id = equipment.get("id", "") if equipment else ""
    equipment_name = equipment.get("name", "Line-90") if equipment else "Line-90"
    equipment_tag = equipment.get("tag", "1") if equipment else "1"

    # Find template IDs
    ext_t = await db.form_templates.find_one({"name": "Extruder settings sample"}, {"_id": 0, "id": 1})
    vis_t = await db.form_templates.find_one({"name": "Mooney viscosity sample"}, {"_id": 0, "id": 1})
    bag_t = await db.form_templates.find_one({"name": "Big Bag Loading"}, {"_id": 0, "id": 1})

    ext_id = ext_t.get("id", "") if ext_t else ""
    vis_id = vis_t.get("id", "") if vis_t else ""
    bag_id = bag_t.get("id", "") if bag_t else ""

    submissions = []

    # Extruder settings samples
    for row in PRODUCTION_LOG:
        h, m = map(int, row["time"].split(":"))
        dt = target_date.replace(hour=h, minute=m, second=0, microsecond=0)
        is_anomaly = (h == 16 and m == 30)

        values = [
            {"field_id": "date_time", "field_label": "Date & Time", "value": dt.isoformat()},
            {"field_id": "rpm", "field_label": "RPM", "value": str(row["rpm"])},
            {"field_id": "feed", "field_label": "FEED", "value": str(row["feed"])},
            {"field_id": "m_pct", "field_label": "M%", "value": str(row["m_pct"])},
            {"field_id": "energy", "field_label": "ENERGY", "value": str(row["energy"])},
            {"field_id": "mt1", "field_label": "MT1", "value": str(row["mt1"])},
            {"field_id": "mt2", "field_label": "MT2", "value": str(row["mt2"])},
            {"field_id": "mt3", "field_label": "MT3", "value": str(row["mt3"])},
            {"field_id": "mp1", "field_label": "MP1", "value": str(row["mp1"] or "")},
            {"field_id": "mp2", "field_label": "MP2", "value": str(row["mp2"])},
            {"field_id": "mp3", "field_label": "MP3", "value": str(row["mp3"])},
            {"field_id": "mp4", "field_label": "MP4", "value": str(row["mp4"])},
            {"field_id": "co2_feed_p", "field_label": "CO2 Feed/P", "value": str(row["co2_feed_p"])},
            {"field_id": "t_product_ir", "field_label": "T Product IR", "value": str(row["t_product_ir"])},
            {"field_id": "remarks", "field_label": "Remarks", "value": row["remarks"]},
        ]

        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": ext_id,
            "form_template_name": "Extruder settings sample",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Mechanical",
            "values": values,
            "attachments": [],
            "notes": "",
            "submitted_by": "seed-script",
            "submitted_by_name": "Operator",
            "submitted_at": dt.isoformat(),
            "has_warnings": is_anomaly,
            "has_critical": False,
            "has_signature": False,
            "status": "submitted",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    # Mooney viscosity samples
    for i, sample in enumerate(VISCOSITY_SAMPLES):
        h, m = map(int, sample["time"].split(":"))
        dt = target_date.replace(hour=h, minute=m, second=0, microsecond=0)
        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": vis_id,
            "form_template_name": "Mooney viscosity sample",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Instrumentation",
            "values": [
                {"field_id": "date_time", "field_label": "Date & Time", "value": dt.isoformat()},
                {"field_id": "sample_no", "field_label": "Sample No.", "value": sample["sample_no"]},
                {"field_id": "measurement", "field_label": "Measurement", "value": str(sample["value"])},
            ],
            "attachments": [],
            "notes": "",
            "submitted_by": "seed-script",
            "submitted_by_name": "Lab Tech",
            "submitted_at": dt.isoformat(),
            "has_warnings": sample["value"] < 55,
            "has_critical": False,
            "has_signature": False,
            "status": "submitted",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    # Big Bag Loading
    bag_times = [(7, 0), (10, 0), (13, 0), (15, 0), (17, 0), (19, 0), (21, 0)]
    for i, entry in enumerate(BIG_BAG_ENTRIES):
        h, m = bag_times[i] if i < len(bag_times) else (7 + i * 2, 0)
        dt = target_date.replace(hour=h, minute=m, second=0, microsecond=0)
        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": bag_id,
            "form_template_name": "Big Bag Loading",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Mechanical",
            "values": [
                {"field_id": "input_material", "field_label": "Input material", "value": HEADER_INFO["input_material"]},
                {"field_id": "supplier", "field_label": "Supplier", "value": HEADER_INFO["supplier"]},
                {"field_id": "bag_no", "field_label": "Bag No.", "value": entry["bag_no"]},
                {"field_id": "lot_no", "field_label": "Lot No.", "value": entry["lot_no"]},
                {"field_id": "production_date", "field_label": "Production Date", "value": entry["production_date"]},
            ],
            "attachments": [],
            "notes": "",
            "submitted_by": "seed-script",
            "submitted_by_name": "Operator",
            "submitted_at": dt.isoformat(),
            "has_warnings": False,
            "has_critical": False,
            "has_signature": False,
            "status": "submitted",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    # Screen changes
    for sc_time in SCREEN_CHANGES:
        h, m = map(int, sc_time.split(":"))
        dt = target_date.replace(hour=h, minute=m, second=0, microsecond=0)
        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": "",
            "form_template_name": "Screen change",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Mechanical",
            "values": [{"field_id": "date_time", "field_label": "Date & Time", "value": dt.isoformat()}],
            "attachments": [],
            "notes": "",
            "submitted_by": "seed-script",
            "submitted_by_name": "Operator",
            "submitted_at": dt.isoformat(),
            "has_warnings": False, "has_critical": False, "has_signature": False,
            "status": "submitted",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    # Magnet cleanings
    for mc_time in MAGNET_CLEANINGS:
        h, m = map(int, mc_time.split(":"))
        dt = target_date.replace(hour=h, minute=m, second=0, microsecond=0)
        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": "",
            "form_template_name": "Magnet cleaning",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Mechanical",
            "values": [{"field_id": "date_time", "field_label": "Date & Time", "value": dt.isoformat()}],
            "attachments": [],
            "notes": "",
            "submitted_by": "seed-script",
            "submitted_by_name": "Operator",
            "submitted_at": dt.isoformat(),
            "has_warnings": False, "has_critical": False, "has_signature": False,
            "status": "submitted",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    # Insert submissions
    if submissions:
        await db.form_submissions.insert_many(submissions)
        print(f"Inserted {len(submissions)} form submissions")

    # Production events
    events = []
    for ev in EVENTS:
        h, m = map(int, ev["time"].split(":"))
        dt = target_date.replace(hour=h, minute=m, second=0, microsecond=0)
        events.append({
            "id": str(uuid.uuid4()),
            "title": ev["title"],
            "description": ev["description"],
            "type": ev["type"],
            "severity": ev["severity"],
            "date": date_str,
            "time": ev["time"],
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    if events:
        await db.production_events.insert_many(events)
        print(f"Inserted {len(events)} production events")

    ext_count = len(PRODUCTION_LOG)
    vis_count = len(VISCOSITY_SAMPLES)
    bag_count = len(BIG_BAG_ENTRIES)
    sc_count = len(SCREEN_CHANGES)
    mc_count = len(MAGNET_CLEANINGS)

    print(f"\nDone! Seeded data for {date_str}")
    print(f"  - {ext_count} Extruder samples")
    print(f"  - {vis_count} Viscosity samples")
    print(f"  - {bag_count} Big Bag entries")
    print(f"  - {sc_count} Screen changes")
    print(f"  - {mc_count} Magnet cleanings")
    print(f"  - {len(events)} production events")
    print(f"\nTo clear: curl -X DELETE \"$API_URL/api/production/seed-data\" -H \"Authorization: Bearer $TOKEN\"")

    client.close()


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(seed_production_data(date_arg))
