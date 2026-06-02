"""
Additional indexes for stabilization (P4). Safe to run multiple times.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

INDEX_SPECS = [
    ("equipment_nodes", "tag", {"tag": 1}, "Tag lookup for imports and search"),
    ("equipment_nodes", "level", {"level": 1}, "Hierarchy level filters"),
    ("equipment_nodes", "parent_level", [("parent_id", 1), ("level", 1)], "Children by parent and level"),
    ("maintenance_programs", "equipment_type_task", [("equipment_type_id", 1), ("task_template_id", 1)], "Strategy propagation queries"),
    ("maintenance_programs", "failure_mode", [("equipment_type_id", 1), ("failure_mode_id", 1)], "FM toggle propagation"),
    ("scheduled_tasks", "program_status", [("maintenance_program_id", 1), ("status", 1)], "Open task cascades"),
    ("background_jobs", "id", {"id": 1}, "Job status lookup", True),
    ("background_jobs", "status_created", [("status", 1), ("created_at", -1)], "Queue health metrics"),
    ("equipment_type_strategies", "equipment_type_id", {"equipment_type_id": 1}, "Strategy by equipment type", True),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    print("Applying stabilization indexes...")
    for spec in INDEX_SPECS:
        coll_name = spec[0]
        name = spec[1]
        keys = spec[2]
        purpose = spec[3]
        unique = spec[4] if len(spec) > 4 else False
        coll = db[coll_name]
        kwargs = {"name": name, "background": True}
        if unique:
            kwargs["unique"] = True
        try:
            await coll.create_index(keys, **kwargs)
            print(f"  ✓ {coll_name}.{name} — {purpose}")
        except Exception as exc:
            print(f"  ⚠ {coll_name}.{name}: {exc}")
    client.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
