#!/usr/bin/env python3
"""Bootstrap Mongo fixtures for CI integration tests (auth + core flows)."""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from database import db  # noqa: E402
from utils.mongo_regex import exact_case_insensitive  # noqa: E402

CI_INSTALLATION_NAME = "Tyromer"
CI_INSTALLATION_ID = "ci-installation-001"
CI_EQUIPMENT_ID = "ci-equipment-001"
CI_THREAT_ID = "ci-threat-001"
CI_AI_THREAT_ID = "43455566-4f46-4c54-8130-fdd7a7d009a1"
CI_ACTION_ID = "ci-action-001"


async def _upsert_user_fields() -> None:
    """Give CI users installation access and profile fields integration tests expect."""
    now = datetime.now(timezone.utc).isoformat()
    for email in ("test@test.com", "test@example.com", "jedijk@gmail.com"):
        await db.users.update_one(
            {"email": exact_case_insensitive(email)},
            {
                "$set": {
                    "assigned_installations": [CI_INSTALLATION_NAME],
                    "department": "Engineering",
                    "company_id": "default",
                    "updated_at": now,
                }
            },
        )


async def seed_ci_fixtures() -> dict:
    """Seed tenant-scoped data for integration smoke tests."""
    now = datetime.now(timezone.utc).isoformat()

    await db.equipment_nodes.update_one(
        {"id": CI_INSTALLATION_ID},
        {
            "$set": {
                "id": CI_INSTALLATION_ID,
                "name": CI_INSTALLATION_NAME,
                "level": "installation",
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    await db.equipment_nodes.update_one(
        {"id": CI_EQUIPMENT_ID},
        {
            "$set": {
                "id": CI_EQUIPMENT_ID,
                "name": "CI Test Pump",
                "tag": "P-CI-001",
                "level": "equipment",
                "parent_id": CI_INSTALLATION_ID,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    for threat_id, title in (
        (CI_THREAT_ID, "CI Integration Threat"),
        (CI_AI_THREAT_ID, "CI AI Risk Threat"),
    ):
        await db.threats.update_one(
            {"id": threat_id},
            {
                "$set": {
                    "id": threat_id,
                    "title": title,
                    "status": "Open",
                    "linked_equipment_id": CI_EQUIPMENT_ID,
                    "asset": "CI Test Pump",
                    "risk_score": 55,
                    "risk_level": "Medium",
                    "created_by": "ci-bootstrap",
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    admin = await db.users.find_one(
        {"email": exact_case_insensitive("test@test.com")},
        {"_id": 0, "id": 1},
    )
    admin_id = (admin or {}).get("id") or "ci-bootstrap"

    await db.central_actions.update_one(
        {"id": CI_ACTION_ID},
        {
            "$set": {
                "id": CI_ACTION_ID,
                "action_number": "ACT-CI-001",
                "title": "CI Integration Action",
                "description": "Seeded action for My Tasks integration tests",
                "source_type": "threat",
                "source_id": CI_THREAT_ID,
                "source_name": "CI Integration Threat",
                "threat_id": CI_THREAT_ID,
                "linked_equipment_id": CI_EQUIPMENT_ID,
                "priority": "medium",
                "status": "open",
                "created_by": admin_id,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    await db.failure_modes.update_one(
        {"failure_mode": "Cavitation"},
        {
            "$set": {
                "failure_mode": "Cavitation",
                "name": "Cavitation",
                "equipment": "Pump",
                "category": "mechanical",
                "severity": 6,
                "occurrence": 4,
                "detectability": 5,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "created_at": now,
            },
        },
        upsert=True,
    )

    dictionary_terms = [
        ("bearing", {"nl": "lager", "de": "Lager"}),
        ("vibration", {"nl": "trilling", "de": "Vibration"}),
        ("seal", {"nl": "afdichting", "de": "Dichtung"}),
        ("pump", {"nl": "pomp", "de": "Pumpe"}),
        ("pressure", {"nl": "druk", "de": "Druck"}),
        ("temperature", {"nl": "temperatuur", "de": "Temperatur"}),
        ("failure", {"nl": "storing", "de": "Ausfall"}),
        ("maintenance", {"nl": "onderhoud", "de": "Wartung"}),
        ("inspection", {"nl": "inspectie", "de": "Inspektion"}),
        ("leak", {"nl": "lekkage", "de": "Leck"}),
    ]
    for idx, (source, translations) in enumerate(dictionary_terms, start=1):
        await db.translation_dictionary.update_one(
            {"source_term": source},
            {
                "$set": {
                    "source_term": source,
                    "translations": translations,
                    "updated_at": now,
                },
                "$setOnInsert": {"id": f"ci-dict-{idx}", "created_at": now},
            },
            upsert=True,
        )
    # Pad to ≥26 terms for dashboard dictionary test
    for idx in range(len(dictionary_terms) + 1, 27):
        term = f"ci_term_{idx}"
        await db.translation_dictionary.update_one(
            {"source_term": term},
            {
                "$set": {
                    "source_term": term,
                    "translations": {"nl": f"{term}_nl", "de": f"{term}_de"},
                    "updated_at": now,
                },
                "$setOnInsert": {"id": f"ci-dict-{idx}", "created_at": now},
            },
            upsert=True,
        )

    await _upsert_user_fields()

    await db.entity_translations.update_one(
        {
            "entity_type": "failure_mode",
            "entity_id": "Cavitation",
            "language_code": "nl",
            "field_name": "name",
        },
        {
            "$set": {
                "entity_type": "failure_mode",
                "entity_id": "Cavitation",
                "language_code": "nl",
                "field_name": "name",
                "translation_value": "Cavitatie",
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    return {
        "installation_id": CI_INSTALLATION_ID,
        "equipment_id": CI_EQUIPMENT_ID,
        "threat_id": CI_THREAT_ID,
        "action_id": CI_ACTION_ID,
    }


async def main() -> int:
    if not os.environ.get("MONGO_URL"):
        print("MONGO_URL not set", file=sys.stderr)
        return 1
    result = await seed_ci_fixtures()
    print(f"CI integration fixtures ready: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
