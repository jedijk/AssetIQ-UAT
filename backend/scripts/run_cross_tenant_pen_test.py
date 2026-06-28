#!/usr/bin/env python3
"""
Live cross-tenant isolation pen test for UAT multi-tenant proof.

Requires docs/platform/UAT_MULTI_TENANT_PROOF_MANIFEST.json from seed_uat_second_tenant_proof.py.

Usage:
  cd backend && MONGO_URL=... DB_NAME=assetiq-UAT TENANT_STRICT_MODE=true \\
    python scripts/run_cross_tenant_pen_test.py
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

DEFAULT_MANIFEST = REPO_ROOT / "docs/platform/UAT_MULTI_TENANT_PROOF_MANIFEST.json"

COLLECTION_SPECS = [
    ("equipment_nodes", "equipment_id"),
    ("observations", "observation_id"),
    ("central_actions", "action_id"),
    ("scheduled_tasks", "scheduled_task_id"),
    ("task_instances", "task_instance_id"),
    ("form_templates", "form_template_id"),
    ("spare_parts", "spare_part_id"),
    ("background_jobs", "background_job_id"),
]


def _user(tenant_id: str, user_id: str = "pen-test") -> dict:
    return {"id": user_id, "company_id": tenant_id, "tenant_id": tenant_id, "role": "admin"}


async def _assert_cannot_read_foreign(
    db,
    reader: dict,
    foreign_tenant_label: str,
    foreign_ids: Dict[str, str],
) -> List[str]:
    from services.tenant_schema import merge_tenant_filter

    failures: List[str] = []
    for collection, id_key in COLLECTION_SPECS:
        doc_id = foreign_ids.get(id_key)
        if not doc_id:
            continue
        query = merge_tenant_filter({"id": doc_id}, reader)
        coll = getattr(db, collection)
        found = await coll.find_one(query, {"_id": 0, "id": 1, "tenant_id": 1})
        if found:
            failures.append(
                f"{reader['tenant_id']} read {foreign_tenant_label} {collection}/{doc_id} "
                f"(tenant_id={found.get('tenant_id')})"
            )
    return failures


async def _test_graph_isolation(db, tenant_a: str, tenant_b: str, proof_ids: dict, primary_ids: dict) -> List[str]:
    from services.reliability_graph_core import get_edges_for_equipment

    failures: List[str] = []
    b_equipment = proof_ids.get("equipment_id")
    a_equipment = primary_ids.get("equipment_id")
    if b_equipment:
        edges_for_a = await get_edges_for_equipment(b_equipment, tenant_id=tenant_a)
        if edges_for_a:
            failures.append(f"Tenant A graph read returned {len(edges_for_a)} edge(s) for Tenant B equipment")
    if a_equipment:
        edges_for_b = await get_edges_for_equipment(a_equipment, tenant_id=tenant_b)
        if edges_for_b:
            failures.append(f"Tenant B graph read returned {len(edges_for_b)} edge(s) for Tenant A equipment")

    from services.reliability_graph_query import get_graph_topology_stats

    stats_a = await get_graph_topology_stats(_user(tenant_a))
    stats_b = await get_graph_topology_stats(_user(tenant_b))
    if stats_a.get("total_edges", 0) > 0 and stats_b.get("total_edges", 0) > 0:
        pass  # both tenants have graph materialization
    return failures


async def _test_background_jobs(db, tenant_a: str, tenant_b: str, proof_ids: dict, primary_ids: dict) -> List[str]:
    from services.tenant_schema import merge_tenant_filter

    failures: List[str] = []
    b_job = proof_ids.get("background_job_id")
    if b_job:
        leak = await db.background_jobs.find_one(merge_tenant_filter({"id": b_job}, _user(tenant_a)))
        if leak:
            failures.append(f"Tenant A read Tenant B background_jobs/{b_job}")
    a_job = primary_ids.get("background_job_id")
    if a_job:
        leak = await db.background_jobs.find_one(merge_tenant_filter({"id": a_job}, _user(tenant_b)))
        if leak:
            failures.append(f"Tenant B read Tenant A background_jobs/{a_job}")
    return failures


async def _test_ai_logs(db, tenant_a: str, tenant_b: str, proof_ids: dict) -> List[str]:
    """AI usage is installation-scoped; verify Tenant A cannot see Tenant B installation logs."""
    failures: List[str] = []
    b_site = proof_ids.get("site_id")
    if not b_site:
        return failures

    a_installations = set()
    async for node in db.equipment_nodes.find(
        {"tenant_id": tenant_a, "level": "installation"},
        {"_id": 0, "id": 1},
    ):
        a_installations.add(node["id"])

    b_logs = await db.ai_usage.find({"installation_id": b_site}).to_list(50)
    if b_logs and b_site in a_installations:
        failures.append("Tenant B AI logs share installation_id with Tenant A hierarchy")
    elif b_logs and b_site not in a_installations:
        # Tenant A should not resolve B's installation as theirs
        cross = await db.ai_usage.find_one({"installation_id": b_site, "tenant_id": tenant_a})
        if cross:
            failures.append("Tenant A ai_usage row found with Tenant B installation_id")
    return failures


async def main() -> int:
    parser = argparse.ArgumentParser(description="Cross-tenant isolation pen test")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.is_file():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        print("Run seed_uat_second_tenant_proof.py first.", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tenant_a = manifest["primary_tenant_id"]
    tenant_b = manifest["proof_tenant"]["tenant_id"]
    proof_ids = manifest.get("proof_tenant_ids") or {}
    primary_ids = manifest.get("primary_tenant_sample_ids") or {}

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL is required", file=sys.stderr)
        return 1

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    os.environ.setdefault("TENANT_STRICT_MODE", "true")

    from motor.motor_asyncio import AsyncIOMotorClient
    import database

    client = AsyncIOMotorClient(mongo_url)
    database.db = client[db_name]
    db = database.db

    user_a = _user(tenant_a, "pen-test-a")
    user_b = _user(tenant_b, "pen-test-b")

    print("=== Cross-tenant isolation pen test ===")
    print(f"  Tenant A: {tenant_a}")
    print(f"  Tenant B: {tenant_b} ({manifest['proof_tenant'].get('slug')})")
    print(f"  Strict mode: {os.environ.get('TENANT_STRICT_MODE')}")

    failures: List[str] = []
    failures.extend(await _assert_cannot_read_foreign(db, user_a, "Tenant B", proof_ids))
    failures.extend(await _assert_cannot_read_foreign(db, user_b, "Tenant A", primary_ids))
    failures.extend(await _test_graph_isolation(db, tenant_a, tenant_b, proof_ids, primary_ids))
    failures.extend(await _test_background_jobs(db, tenant_a, tenant_b, proof_ids, primary_ids))
    failures.extend(await _test_ai_logs(db, tenant_a, tenant_b, proof_ids))

    report = {
        "passed": len(failures) == 0,
        "failure_count": len(failures),
        "failures": failures,
        "tenant_a": tenant_a,
        "tenant_b": tenant_b,
    }
    print(json.dumps(report, indent=2))

    client.close()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
