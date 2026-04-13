"""
Seed sample production data for the Production Dashboard.
Creates realistic Extruder settings and Mooney Viscosity form submissions for Line-90.

Usage:
  python scripts/seed_production_data.py          # Seed data for today
  python scripts/seed_production_data.py 2026-04-02  # Seed data for specific date

To clear seeded data:
  curl -X DELETE "$API_URL/api/production/seed-data" -H "Authorization: Bearer $TOKEN"
"""
import asyncio
import sys
import os
import uuid
import random
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


async def seed_production_data(target_date_str=None):
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    if target_date_str:
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        target_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    date_str = target_date.strftime("%Y-%m-%d")
    print(f"Seeding production data for {date_str}...")

    # Check if seeded data already exists for this date
    existing = await db.form_submissions.count_documents({
        "_seeded": True,
        "submitted_at": {"$regex": f"^{date_str}"}
    })
    if existing > 0:
        print(f"Found {existing} existing seeded submissions for {date_str}. Skipping. Use the clear endpoint to remove first.")
        client.close()
        return

    # Find the equipment ID for Line-90
    equipment = await db.equipment_nodes.find_one(
        {"name": {"$regex": "Line.?90", "$options": "i"}},
        {"_id": 0, "id": 1, "name": 1, "tag": 1}
    )
    equipment_id = equipment.get("id", "") if equipment else ""
    equipment_name = equipment.get("name", "Line-90") if equipment else "Line-90"
    equipment_tag = equipment.get("tag", "1") if equipment else "1"

    # Find form template IDs
    extruder_template = await db.form_templates.find_one(
        {"name": "Extruder settings sample"}, {"_id": 0, "id": 1}
    )
    viscosity_template = await db.form_templates.find_one(
        {"name": "Mooney Viscosity sample"}, {"_id": 0, "id": 1}
    )
    big_bag_template = await db.form_templates.find_one(
        {"name": "Big Bag Loading"}, {"_id": 0, "id": 1}
    )

    extruder_template_id = extruder_template.get("id", "") if extruder_template else ""
    viscosity_template_id = viscosity_template.get("id", "") if viscosity_template else ""
    big_bag_template_id = big_bag_template.get("id", "") if big_bag_template else ""

    submissions = []

    # Generate Extruder settings samples every ~1.5 hours during day shift (06:00-22:00)
    # Simulate realistic production data
    base_rpm = 520
    base_feed = 160
    base_energy = 0.285
    base_mt1 = 154
    base_mt2 = 152
    base_mt3 = 155
    base_viscosity = 57.0

    extruder_times = [
        (8, 0), (9, 15), (10, 30), (11, 45), (13, 0), (14, 15),
        (15, 30), (16, 30), (17, 0), (18, 0), (19, 15), (20, 0),
    ]

    for i, (hour, minute) in enumerate(extruder_times):
        dt = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)

        # Add some variation, with an anomaly at 16:30
        is_anomaly = (hour == 16 and minute == 30)

        rpm = base_rpm + random.randint(-20, 20)
        feed = base_feed + random.randint(-10, 15)
        energy = round(base_energy + random.uniform(-0.02, 0.03), 3)
        mt1 = base_mt1 + random.randint(-4, 4)
        mt2 = base_mt2 + random.randint(-4, 4)
        mt3 = base_mt3 + random.randint(-3, 3)
        mt4 = random.randint(5, 10)
        co2 = round(random.uniform(12.0, 15.0), 1)
        waste = round(random.uniform(20, 60), 1)

        if is_anomaly:
            # Anomaly: high waste, different parameters
            rpm = 500
            feed = 145
            energy = 0.279
            mt1 = 150
            mt2 = 100
            mt3 = 154
            mt4 = 7
            co2 = 14.5
            waste = 245.0

        moisture = round(random.uniform(0.8, 1.5), 1)

        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": extruder_template_id,
            "form_template_name": "Extruder settings sample",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Mechanical",
            "values": [
                {"field_id": "date_time", "field_label": "Date & Time", "value": dt.isoformat()},
                {"field_id": "rpm", "field_label": "RPM", "value": str(rpm)},
                {"field_id": "feed", "field_label": "FEED", "value": str(feed)},
                {"field_id": "m_pct", "field_label": "M%", "value": str(moisture)},
                {"field_id": "energy", "field_label": "ENERGY", "value": str(energy)},
                {"field_id": "mt1", "field_label": "MT1", "value": str(mt1)},
                {"field_id": "mt2", "field_label": "MT2", "value": str(mt2)},
                {"field_id": "mt3", "field_label": "MT3", "value": str(mt3)},
                {"field_id": "mt4", "field_label": "MT4", "value": str(mt4)},
                {"field_id": "co2_feeds", "field_label": "CO2 Feeds", "value": str(co2)},
                {"field_id": "waste", "field_label": "Waste", "value": str(waste)},
            ],
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

    # Generate Mooney Viscosity samples every ~2 hours
    viscosity_times = [
        (8, 30), (10, 45), (13, 15), (15, 0), (16, 30), (18, 30), (20, 15),
    ]

    for i, (hour, minute) in enumerate(viscosity_times):
        dt = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)

        is_anomaly = (hour == 16 and minute == 30)
        if is_anomaly:
            measurement = 51.28
        else:
            measurement = round(base_viscosity + random.uniform(-2.5, 2.5), 2)

        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": viscosity_template_id,
            "form_template_name": "Mooney Viscosity sample",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Instrumentation",
            "values": [
                {"field_id": "date_time", "field_label": "Date & Time", "value": dt.isoformat()},
                {"field_id": "sample_no", "field_label": "Sample No.", "value": f"S-{i+1:03d}"},
                {"field_id": "measurement", "field_label": "Measurement", "value": str(measurement)},
            ],
            "attachments": [],
            "notes": "",
            "submitted_by": "seed-script",
            "submitted_by_name": "Lab Tech",
            "submitted_at": dt.isoformat(),
            "has_warnings": is_anomaly,
            "has_critical": False,
            "has_signature": False,
            "status": "submitted",
            "created_at": dt.isoformat(),
            "_seeded": True,
        })

    # Generate Big Bag Loading entries
    big_bag_times = [(7, 0), (12, 0), (17, 0)]
    for i, (hour, minute) in enumerate(big_bag_times):
        dt = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
        submissions.append({
            "id": str(uuid.uuid4()),
            "form_template_id": big_bag_template_id,
            "form_template_name": "Big Bag Loading",
            "task_instance_id": None,
            "task_template_name": None,
            "equipment_id": equipment_id,
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "discipline": "Mechanical",
            "values": [
                {"field_id": "input_material", "field_label": "Input material", "value": "Type 2.00"},
                {"field_id": "supplier", "field_label": "Supplier", "value": "Tyromer BV"},
                {"field_id": "bag_no", "field_label": "Bag No.", "value": f"B-{random.randint(100,999)}"},
                {"field_id": "lot_no", "field_label": "Lot No.", "value": f"16901"},
                {"field_id": "production_date", "field_label": "Production Date", "value": date_str},
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

    # Insert all form submissions
    if submissions:
        await db.form_submissions.insert_many(submissions)
        print(f"Inserted {len(submissions)} form submissions")

    # Create production events (actions + insights)
    events = [
        {
            "id": str(uuid.uuid4()),
            "title": "Sheet breaking + downtime",
            "description": "120 kg waste + 15 min downtime at 16:30",
            "type": "action",
            "severity": "critical",
            "date": date_str,
            "time": "16:30",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=16, minute=35).isoformat(),
            "_seeded": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Linked waste events at 16:30",
            "description": "Sheet breaking - 120 kg, Downtime - 15 min",
            "type": "action",
            "severity": "warning",
            "date": date_str,
            "time": "16:30",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=16, minute=35).isoformat(),
            "_seeded": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Stable operation",
            "description": "Parameters stable between 08:15-11:45",
            "type": "action",
            "severity": "success",
            "date": date_str,
            "time": "11:50",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=11, minute=50).isoformat(),
            "_seeded": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Feed reduction impacted output",
            "description": "Reduced output: 6.53 kg loss over 15 min",
            "type": "action",
            "severity": "info",
            "date": date_str,
            "time": "16:32",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=16, minute=32).isoformat(),
            "_seeded": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Sheet breaking + downtime at 16:30",
            "description": "120 kg + 15 min downtime",
            "type": "insight",
            "severity": "critical",
            "date": date_str,
            "time": "16:35",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=16, minute=35).isoformat(),
            "_seeded": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Stable operation",
            "description": "Parameters stable between 08:15-11:45",
            "type": "insight",
            "severity": "success",
            "date": date_str,
            "time": "11:54",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=11, minute=54).isoformat(),
            "_seeded": True,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Viscosity trending low",
            "description": "Average viscosity dropped below 55 MU target range",
            "type": "insight",
            "severity": "warning",
            "date": date_str,
            "time": "17:00",
            "equipment_name": equipment_name,
            "created_by": "seed-script",
            "created_by_name": "System",
            "created_at": target_date.replace(hour=17, minute=0).isoformat(),
            "_seeded": True,
        },
    ]

    if events:
        await db.production_events.insert_many(events)
        print(f"Inserted {len(events)} production events")

    print(f"Done! Seeded data for {date_str}")
    print(f"  - {len([s for s in submissions if s['form_template_name'] == 'Extruder settings sample'])} Extruder samples")
    print(f"  - {len([s for s in submissions if s['form_template_name'] == 'Mooney Viscosity sample'])} Viscosity samples")
    print(f"  - {len([s for s in submissions if s['form_template_name'] == 'Big Bag Loading'])} Big Bag entries")
    print(f"  - {len(events)} production events (actions + insights)")
    print(f"\nTo clear: curl -X DELETE \"$API_URL/api/production/seed-data\" -H \"Authorization: Bearer $TOKEN\"")

    client.close()


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(seed_production_data(date_arg))
