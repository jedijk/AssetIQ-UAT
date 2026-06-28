#!/usr/bin/env python3
"""
Create UAT Proof Tenant B and seed minimal lifecycle data for multi-tenant isolation proof.

Usage:
  cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python scripts/seed_uat_second_tenant_proof.py
  cd backend && MONGO_URL=... DB_NAME=assetiq-UAT python scripts/seed_uat_second_tenant_proof.py --dry-run

Writes manifest JSON to docs/platform/UAT_MULTI_TENANT_PROOF_MANIFEST.json (override with --manifest).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

PROOF_SLUG = "uat-proof-b"
PROOF_NAME = "UAT Proof Tenant B"
PROOF_ADMIN_EMAIL = "uat-proof-b-admin@assetiq-uat.internal"
PROOF_ADMIN_NAME = "UAT Proof B Admin"
PROOF_PREFIX = "proof-b-"
PRIMARY_TENANT_ID = os.environ.get("PRIMARY_TENANT_ID", "Tyromer")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _proof_id(key: str) -> str:
    return f"{PROOF_PREFIX}{key}"


async def _resolve_actor(db):
    owner = await db.users.find_one({"role": "owner"}, {"_id": 0, "id": 1, "email": 1, "company_id": 1, "tenant_id": 1})
    if owner:
        return owner
    admin = await db.users.find_one({"role": "admin"}, sort=[("created_at", 1)])
    if admin:
        return admin
    return {
        "id": "proof-sprint-system",
        "email": "system@assetiq.internal",
        "company_id": PRIMARY_TENANT_ID,
        "tenant_id": PRIMARY_TENANT_ID,
        "role": "owner",
    }


async def _get_or_create_tenant_b(db, actor: dict, *, dry_run: bool) -> tuple[str, str, bool]:
    existing = await db.tenants.find_one({"slug": PROOF_SLUG}, {"_id": 0, "tenant_id": 1})
    if existing:
        tenant_id = existing["tenant_id"]
        admin = await db.users.find_one(
            {"email": PROOF_ADMIN_EMAIL},
            {"_id": 0, "id": 1},
        )
        return tenant_id, (admin or {}).get("id", ""), False

    if dry_run:
        return str(uuid.uuid4()), _proof_id("admin"), True

    from services.tenant_management_service import create_tenant

    result = await create_tenant(
        db,
        {
            "name": PROOF_NAME,
            "slug": PROOF_SLUG,
            "primary_admin_name": PROOF_ADMIN_NAME,
            "primary_admin_email": PROOF_ADMIN_EMAIL,
            "primary_admin_password": f"Proof-{uuid.uuid4().hex[:10]}!",
            "return_temp_password": True,
            "site_name": "Proof Site Alpha",
            "installation_name": "Proof Plant Unit 1",
            "status": "active",
            "default_language": "en",
            "default_timezone": "UTC",
        },
        actor,
    )
    admin_user = await db.users.find_one({"email": PROOF_ADMIN_EMAIL}, {"_id": 0, "id": 1})
    return result["tenant_id"], admin_user["id"], True


async def _upsert_equipment_chain(db, tenant_id: str, actor_id: str, *, dry_run: bool) -> dict:
    from iso14224_models import ISOLevel
    from services.tenant_schema import with_tenant_id

    now = _now()
    user_ctx = {"company_id": tenant_id, "tenant_id": tenant_id, "id": actor_id}
    site_id = _proof_id("site")
    installation_id = _proof_id("installation")
    equipment_id = _proof_id("equipment")

    nodes = [
        {
            "id": site_id,
            "name": "Proof Site Alpha",
            "level": ISOLevel.INSTALLATION.value,
            "parent_id": None,
            "sort_order": 1,
        },
        {
            "id": installation_id,
            "name": "Proof Plant Unit 1",
            "level": ISOLevel.PLANT_UNIT.value,
            "parent_id": site_id,
            "installation_id": site_id,
            "sort_order": 1,
        },
        {
            "id": equipment_id,
            "name": "Proof Pump B-001",
            "tag": "P-PROOF-B001",
            "level": ISOLevel.EQUIPMENT.value,
            "parent_id": installation_id,
            "installation_id": site_id,
            "equipment_type_id": "pump",
            "sort_order": 1,
        },
    ]

    if not dry_run:
        for node in nodes:
            doc = with_tenant_id(
                {
                    **node,
                    "created_by": actor_id,
                    "created_at": now,
                    "updated_at": now,
                },
                user_ctx,
            )
            await db.equipment_nodes.update_one({"id": node["id"]}, {"$set": doc}, upsert=True)

    return {"site_id": site_id, "installation_id": installation_id, "equipment_id": equipment_id}


async def _seed_domain_docs(
    db,
    tenant_id: str,
    admin_id: str,
    equipment: dict,
    *,
    dry_run: bool,
) -> dict:
    from services.reliability_graph_core import upsert_edge
    from services.tenant_schema import with_tenant_id

    now = _now()
    user_ctx = {"company_id": tenant_id, "tenant_id": tenant_id, "id": admin_id}
    obs_id = _proof_id("observation")
    threat_id = obs_id  # convergence same-id
    action_id = _proof_id("action")
    scheduled_task_id = _proof_id("scheduled-task")
    task_instance_id = _proof_id("task-instance")
    form_id = _proof_id("form")
    spare_id = _proof_id("spare")
    job_id = _proof_id("background-job")

    observation = with_tenant_id(
        {
            "id": obs_id,
            "description": "Proof Tenant B observation — vibration anomaly",
            "status": "open",
            "risk_level": "Medium",
            "risk_score": 45,
            "linked_equipment_id": equipment["equipment_id"],
            "equipment_tag": "P-PROOF-B001",
            "created_by": admin_id,
            "created_at": now,
            "updated_at": now,
        },
        user_ctx,
    )
    threat = with_tenant_id(
        {
            **observation,
            "title": observation["description"],
            "asset": "Proof Pump B-001",
            "threat_number": "OBS-PROOF-B001",
        },
        user_ctx,
    )
    action = with_tenant_id(
        {
            "id": action_id,
            "action_number": "ACT-PROOF-B001",
            "title": "Proof Tenant B action",
            "description": "Inspect proof pump bearings",
            "source_type": "threat",
            "source_id": threat_id,
            "source_name": threat["title"],
            "threat_id": threat_id,
            "linked_equipment_id": equipment["equipment_id"],
            "priority": "medium",
            "status": "open",
            "created_by": admin_id,
            "created_at": now,
            "updated_at": now,
        },
        user_ctx,
    )
    scheduled_task = with_tenant_id(
        {
            "id": scheduled_task_id,
            "title": "Proof PM — lubricate pump",
            "equipment_id": equipment["equipment_id"],
            "installation_id": equipment["site_id"],
            "status": "open",
            "discipline": "Mechanical",
            "frequency": "monthly",
            "created_by": admin_id,
            "created_at": now,
            "updated_at": now,
        },
        user_ctx,
    )
    task_instance = with_tenant_id(
        {
            "id": task_instance_id,
            "scheduled_task_id": scheduled_task_id,
            "equipment_id": equipment["equipment_id"],
            "installation_id": equipment["site_id"],
            "title": scheduled_task["title"],
            "status": "open",
            "due_date": now[:10],
            "created_by": admin_id,
            "created_at": now,
            "updated_at": now,
        },
        user_ctx,
    )
    form_template = with_tenant_id(
        {
            "id": form_id,
            "name": "Proof Tenant B Inspection",
            "discipline": "Mechanical",
            "version": 1,
            "is_active": True,
            "fields": [],
            "created_by": admin_id,
            "created_at": now,
            "updated_at": now,
        },
        user_ctx,
    )
    spare_part = with_tenant_id(
        {
            "id": spare_id,
            "description": "Proof seal kit",
            "type_model": "SK-PROOF-B",
            "manufacturer": "ProofCo",
            "category": "Seals",
            "equipment_links": [{"equipment_id": equipment["equipment_id"], "quantity": 1}],
            "duplicate_key": "proof-seal-kit|sk-proof-b",
            "created_by": admin_id,
            "created_at": now,
            "updated_at": now,
        },
        user_ctx,
    )
    background_job = with_tenant_id(
        {
            "id": job_id,
            "job_type": "proof_tenant_isolation",
            "status": "completed",
            "user_id": admin_id,
            "payload": {"proof": True},
            "created_at": now,
            "updated_at": now,
            "completed_at": now,
        },
        user_ctx,
    )
    ai_usage = {
        "installation_id": equipment["site_id"],
        "installation_name": "Proof Site Alpha",
        "user_id": admin_id,
        "tenant_id": tenant_id,
        "model": "gpt-5.2",
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "total_tokens": 15,
        "feature": "proof_tenant_isolation",
        "metadata": {"tenant_id": tenant_id},
        "timestamp": now,
        "date": now[:10],
    }

    if not dry_run:
        await db.observations.update_one({"id": obs_id}, {"$set": observation}, upsert=True)
        await db.threats.update_one({"id": threat_id}, {"$set": threat}, upsert=True)
        await db.central_actions.update_one({"id": action_id}, {"$set": action}, upsert=True)
        await db.scheduled_tasks.update_one({"id": scheduled_task_id}, {"$set": scheduled_task}, upsert=True)
        await db.task_instances.update_one({"id": task_instance_id}, {"$set": task_instance}, upsert=True)
        await db.form_templates.update_one({"id": form_id}, {"$set": form_template}, upsert=True)
        await db.spare_parts.update_one({"id": spare_id}, {"$set": spare_part}, upsert=True)
        await db.background_jobs.update_one({"id": job_id}, {"$set": background_job}, upsert=True)
        await db.ai_usage.update_one(
            {"feature": "proof_tenant_isolation", "installation_id": equipment["site_id"]},
            {"$set": ai_usage},
            upsert=True,
        )
        await upsert_edge(
            source_type="observation",
            source_id=obs_id,
            relation="monitors",
            target_type="equipment",
            target_id=equipment["equipment_id"],
            equipment_id=equipment["equipment_id"],
            tenant_id=tenant_id,
        )

    return {
        "observation_id": obs_id,
        "threat_id": threat_id,
        "action_id": action_id,
        "scheduled_task_id": scheduled_task_id,
        "task_instance_id": task_instance_id,
        "form_template_id": form_id,
        "spare_part_id": spare_id,
        "background_job_id": job_id,
        "graph_edge_id": f"observation:{obs_id}:monitors:equipment:{equipment['equipment_id']}",
    }


async def _sample_primary_tenant_ids(db, tenant_id: str) -> dict:
    samples = {}
    specs = [
        ("equipment_nodes", "equipment_id"),
        ("observations", "observation_id"),
        ("central_actions", "action_id"),
        ("scheduled_tasks", "scheduled_task_id"),
        ("task_instances", "task_instance_id"),
        ("form_templates", "form_template_id"),
        ("spare_parts", "spare_part_id"),
        ("background_jobs", "background_job_id"),
    ]
    for collection, key in specs:
        doc = await db[collection].find_one({"tenant_id": tenant_id}, {"_id": 0, "id": 1})
        if doc:
            samples[key] = doc["id"]
    edge = await db.reliability_edges.find_one({"tenant_id": tenant_id}, {"_id": 0, "id": 1})
    if edge:
        samples["graph_edge_id"] = edge["id"]
    admin = await db.users.find_one(
        {"$or": [{"tenant_id": tenant_id}, {"company_id": tenant_id}], "role": {"$in": ["owner", "admin"]}},
        {"_id": 0, "id": 1, "email": 1},
    )
    if admin:
        samples["admin_user_id"] = admin["id"]
        samples["admin_email"] = admin.get("email")
    return samples


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed UAT Proof Tenant B")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--manifest",
        default=str(REPO_ROOT / "docs/platform/UAT_MULTI_TENANT_PROOF_MANIFEST.json"),
    )
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL is required", file=sys.stderr)
        return 1

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    os.environ.setdefault("JWT_SECRET_KEY", "proof-sprint")
    os.environ.setdefault("TENANT_STRICT_MODE", "true")

    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    actor = await _resolve_actor(db)
    tenant_b_id, admin_b_id, created = await _get_or_create_tenant_b(db, actor, dry_run=args.dry_run)
    equipment = await _upsert_equipment_chain(db, tenant_b_id, admin_b_id or actor["id"], dry_run=args.dry_run)
    domain_ids = await _seed_domain_docs(
        db,
        tenant_b_id,
        admin_b_id or actor["id"],
        equipment,
        dry_run=args.dry_run,
    )
    primary_ids = await _sample_primary_tenant_ids(db, PRIMARY_TENANT_ID)

    manifest = {
        "generated_at": _now(),
        "database": db_name,
        "primary_tenant_id": PRIMARY_TENANT_ID,
        "proof_tenant": {
            "tenant_id": tenant_b_id,
            "slug": PROOF_SLUG,
            "admin_email": PROOF_ADMIN_EMAIL,
            "admin_user_id": admin_b_id,
            "created": created,
        },
        "proof_tenant_ids": {**equipment, **domain_ids},
        "primary_tenant_sample_ids": primary_ids,
        "dry_run": args.dry_run,
    }

    manifest_path = Path(args.manifest)
    if not args.dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(manifest, indent=2))
    if args.dry_run:
        print("\nDRY RUN — no writes performed")
    else:
        print(f"\nManifest written to {manifest_path}")

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
