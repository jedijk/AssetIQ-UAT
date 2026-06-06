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


def _static_path_checks() -> list[str]:
    """Return list of static check failures."""
    failures: list[str] = []

    checks = [
        (
            BACKEND_ROOT / "services" / "task_service.py",
            ["sync_edges_for_scheduled_task", "sync_task_instance_completion_edges"],
            "task_service graph sync",
        ),
        (
            BACKEND_ROOT / "routes" / "maintenance_scheduler" / "programs.py",
            ["sync_edges_for_apply_strategy"],
            "programs apply strategy",
        ),
        (
            BACKEND_ROOT / "services" / "pm_import" / "failure_mode_apply.py",
            ["_sync_pm_import_graph_edge"],
            "pm_import failure_mode_apply",
        ),
        (
            BACKEND_ROOT / "routes" / "maintenance_scheduler" / "scheduler.py",
            ['event="created"'],
            "scheduler create-time sync",
        ),
        (
            BACKEND_ROOT / "services" / "observation_service.py",
            ["sync_observation_edges"],
            "observation_service",
        ),
        (
            BACKEND_ROOT / "routes" / "chat.py",
            ["sync_threat_edges"],
            "chat threat create",
        ),
        (
            BACKEND_ROOT / "routes" / "investigations.py",
            ["sync_investigation_edges", "sync_cause_edge"],
            "investigations routes",
        ),
        (
            BACKEND_ROOT / "routes" / "actions.py",
            ["sync_action_edges", "sync_outcome_edges"],
            "actions routes",
        ),
        (
            BACKEND_ROOT / "services" / "reliability_graph_query.py",
            ["class GraphTraversalService", "explain_risk"],
            "GraphTraversalService",
        ),
        (
            BACKEND_ROOT / "services" / "reliability_graph.py",
            ["tenant_id", "retire_edges_for_entity", "sync_outcome_edges"],
            "reliability_graph platform",
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


async def _db_sample_audit() -> tuple[bool, list[str]]:
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("SKIP db sampling: MONGO_URL not set")
        return True, []

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
