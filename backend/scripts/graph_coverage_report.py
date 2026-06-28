#!/usr/bin/env python3
"""Graph coverage report — Convergence Program Phase 1 CI gate."""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow offline handler inventory without a live MongoDB connection.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/ci-graph-report")
os.environ.setdefault("DB_NAME", "test")

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.reliability_graph.graph_sync_registry import GRAPH_SYNC_HANDLERS  # noqa: E402

# Entity write paths expected to dispatch graph sync (handler must exist in registry).
ENTITY_COVERAGE = [
    {
        "entity": "observation",
        "handler": "sync_observation_edges",
        "write_paths": ("observation_service",),
    },
    {
        "entity": "threat",
        "handler": "sync_threat_edges",
        "write_paths": (
            "chat_routes_service",
            "threat_service",
            "task_service_completion",
            "my_tasks_service",
        ),
    },
    {
        "entity": "investigation",
        "handler": "sync_investigation_edges",
        "write_paths": ("threat_service_investigation", "investigation_service"),
    },
    {
        "entity": "action",
        "handler": "sync_action_edges",
        "write_paths": ("action_service", "investigation_service"),
    },
    {
        "entity": "outcome",
        "handler": "sync_outcome_edges",
        "write_paths": ("action_outcome_service",),
    },
    {
        "entity": "scheduled_task",
        "handler": "sync_edges_for_scheduled_task",
        "write_paths": ("maintenance_scheduling", "maintenance_scheduler_service"),
    },
    {
        "entity": "task_instance",
        "handler": "sync_task_instance_completion_edges",
        "write_paths": ("task_service_completion", "maintenance_scheduler_service"),
    },
    {
        "entity": "strategy_apply",
        "handler": "sync_edges_for_apply_strategy",
        "write_paths": ("apply_strategy_service",),
    },
    {
        "entity": "pm_import_task",
        "handler": "sync_edge_for_pm_import_task",
        "write_paths": ("pm_import_graph_sync",),
    },
    {
        "entity": "prediction",
        "handler": "sync_prediction_edges",
        "write_paths": ("ril_predictions",),
    },
]


def build_report() -> dict:
    registered = set(GRAPH_SYNC_HANDLERS.keys())
    missing_handlers: list[str] = []
    covered_entities: list[str] = []

    for row in ENTITY_COVERAGE:
        handler = row["handler"]
        if handler not in registered:
            missing_handlers.append(handler)
        else:
            covered_entities.append(row["entity"])

    return {
        "handlers_registered": len(registered),
        "entities_expected": len(ENTITY_COVERAGE),
        "entities_with_handler": len(covered_entities),
        "missing_handlers": missing_handlers,
        "coverage_pct": round(
            100.0 * len(covered_entities) / max(len(ENTITY_COVERAGE), 1),
            1,
        ),
    }


def main() -> int:
    report = build_report()
    print("=== Graph Coverage Report (Convergence 3 / Phase 1) ===")
    print(f"Handlers registered: {report['handlers_registered']}")
    print(f"Entity coverage: {report['entities_with_handler']}/{report['entities_expected']} "
          f"({report['coverage_pct']}%)")
    if report["missing_handlers"]:
        print("\nMissing handlers:")
        for name in report["missing_handlers"]:
            print(f"  - {name}")
        return 1
    print("\nAll expected graph sync handlers are registered.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
