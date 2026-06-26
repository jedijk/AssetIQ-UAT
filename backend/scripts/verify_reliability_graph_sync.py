#!/usr/bin/env python3
"""
UAT gate: reliability graph edge sync audit.

Static checks verify sync hooks exist in code paths; optional DB sampling
when MONGO_URL is set validates edge materialization in the target environment.

    cd backend && python scripts/verify_reliability_graph_sync.py
    cd backend && MONGO_URL=... python scripts/verify_reliability_graph_sync.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent

# Ensure backend is in Python path for module imports
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Static checks import service modules that load database.py at import time.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/graph-sync-gate")
os.environ.setdefault("DB_NAME", "graph-sync-gate")
os.environ.setdefault("JWT_SECRET_KEY", "graph-audit-script")
os.environ.setdefault("ENVIRONMENT", "test")


def _static_path_checks() -> list[str]:
    """Return list of static check failures."""
    failures: list[str] = []

    from services.reliability_graph import GRAPH_SYNC_HANDLERS
    from services.reliability_graph_ownership import (
        APPROVED_UPSERT_MODULES,
        scan_unapproved_upsert_callers,
        validate_ontology_relations,
        validate_ownership_covers_handlers,
    )
    from services.reliability_ontology import RELATIONS

    handler_gaps = validate_ownership_covers_handlers(frozenset(GRAPH_SYNC_HANDLERS.keys()))
    for msg in handler_gaps:
        failures.append(f"ownership matrix: {msg}")

    ontology_gaps = validate_ontology_relations(RELATIONS)
    for msg in ontology_gaps:
        failures.append(f"ownership matrix: {msg}")

    upsert_violations = scan_unapproved_upsert_callers(BACKEND_ROOT / "services")
    for rel in upsert_violations:
        if rel not in APPROVED_UPSERT_MODULES:
            failures.append(f"unapproved upsert_edge caller: {rel}")

    ownership_module = BACKEND_ROOT / "services" / "reliability_graph_ownership.py"
    if not ownership_module.is_file():
        failures.append("reliability_graph_ownership.py not found")

    checks = [
        (
            BACKEND_ROOT / "services" / "task_service_completion.py",
            ["sync_edges_for_scheduled_task", "sync_task_instance_completion_edges"],
            "task_service_completion graph sync",
        ),
        (
            BACKEND_ROOT / "services" / "apply_strategy_service.py",
            ["sync_edges_for_apply_strategy"],
            "apply_strategy_service",
        ),
        (
            BACKEND_ROOT / "services" / "pm_import" / "failure_mode_apply.py",
            ["_sync_pm_import_graph_edge"],
            "pm_import failure_mode_apply",
        ),
        (
            BACKEND_ROOT / "services" / "maintenance_scheduling.py",
            ['event="created"'],
            "maintenance_scheduling create-time sync",
        ),
        (
            BACKEND_ROOT / "services" / "observation_service.py",
            ["sync_observation_edges"],
            "observation_service",
        ),
        (
            BACKEND_ROOT / "services" / "threat_helpers.py",
            ["dispatch_graph_sync", "sync_threat_edges"],
            "threat_helpers graph dispatch",
        ),
        (
            BACKEND_ROOT / "services" / "investigation_crud.py",
            ["dispatch_graph_sync", "sync_investigation_edges"],
            "investigation_crud graph dispatch",
        ),
        (
            BACKEND_ROOT / "services" / "investigation_subresources.py",
            ["dispatch_graph_sync", "sync_cause_edge"],
            "investigation_subresources graph dispatch",
        ),
        (
            BACKEND_ROOT / "services" / "action_service.py",
            ["sync_action_edges", "sync_outcome_edges"],
            "action_service",
        ),
        (
            BACKEND_ROOT / "services" / "reliability_graph_query.py",
            ["class GraphTraversalService", "explain_risk"],
            "GraphTraversalService",
        ),
        (
            BACKEND_ROOT / "services" / "reliability_graph.py",
            ["tenant_id", "retire_edges_for_entity", "sync_outcome_edges", "dispatch_graph_sync"],
            "reliability_graph platform",
        ),
        (
            BACKEND_ROOT / "services" / "reliability_snapshot_service.py",
            ["refresh_reliability_snapshots", "get_graph_at_time"],
            "reliability_snapshot_service",
        ),
        (
            BACKEND_ROOT / "services" / "job_handlers.py",
            ["reliability_snapshots_daily_refresh"],
            "reliability snapshot job handler",
        ),
    ]

    for path, needles, label in checks:
        if not path.is_file():
            failures.append(f"{label}: {path.name} not found")
            continue
        src = path.read_text()
        for needle in needles:
            if needle not in src:
                failures.append(f"{label}: missing {needle}")

    audit_module = BACKEND_ROOT / "services" / "reliability_graph_audit.py"
    if not audit_module.is_file():
        failures.append("reliability_graph_audit.py not found")
    else:
        audit_src = audit_module.read_text()
        for fn in ("audit_observation_edges", "audit_scheduled_task_created", "audit_investigation_chain"):
            if fn not in audit_src:
                failures.append(f"reliability_graph_audit missing {fn}")

    return failures


def _should_skip_db_sampling() -> str | None:
    """Return skip reason, or None when DB sampling should run."""
    if not os.environ.get("MONGO_URL"):
        return "MONGO_URL not set"
    env = os.environ.get("ENVIRONMENT", "").lower()
    if env in ("test", "testing"):
        return "ENVIRONMENT=test (CI uses mocked graph sync)"
    if os.environ.get("GRAPH_AUDIT_SKIP_DB", "").lower() in ("1", "true", "yes"):
        return "GRAPH_AUDIT_SKIP_DB set"
    return None


async def _db_sample_audit() -> tuple[bool, list[str]]:
    skip = _should_skip_db_sampling()
    if skip:
        print(f"SKIP db sampling: {skip}")
        return True, []

    mongo_url = os.environ.get("MONGO_URL")
    assert mongo_url

    os.environ.setdefault("JWT_SECRET_KEY", "graph-audit-script")
    os.environ.setdefault("REQUIRE_JWT_SECRET_KEY", "false")

    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url)
    import database

    database.db = client[db_name]

    from services.reliability_graph_audit import sample_db_audit

    tenant_id = os.environ.get("GRAPH_AUDIT_TENANT_ID")
    report = await sample_db_audit(
        limit=int(os.environ.get("GRAPH_AUDIT_SAMPLE_LIMIT", "50")),
        tenant_id=tenant_id,
    )
    client.close()

    for section in (
        "apply_strategy",
        "pm_import",
        "task_complete",
        "scheduled_created",
        "observation",
        "investigation",
    ):
        print(f"DB sample — {section} checked: {report[section]['checked']}")
    print(f"DB sample — edges missing tenant_id: {report.get('tenant_edges_missing_id', 0)}")
    print(f"DB sample — total gaps: {report['total_gaps']}")

    if report["total_gaps"]:
        for section in (
            "apply_strategy",
            "pm_import",
            "task_complete",
            "scheduled_created",
            "observation",
            "investigation",
        ):
            for gap in report[section]["gaps"][:5]:
                print(f"  GAP [{section}]: {gap}")
        return False, [f"{report['total_gaps']} edge gap(s) in DB sample"]

    print("OK: DB sample found no edge gaps")
    return True, []


def main() -> int:
    print("=== Reliability graph sync gate ===\n")

    static_failures = _static_path_checks()
    if static_failures:
        for msg in static_failures:
            print(f"STATIC FAIL: {msg}", file=sys.stderr)
        return 2

    print("OK: static path checks passed")

    db_ok, db_errors = asyncio.run(_db_sample_audit())
    if not db_ok:
        for msg in db_errors:
            print(f"DB FAIL: {msg}", file=sys.stderr)
        return 2

    print("\nOK: reliability graph sync gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
