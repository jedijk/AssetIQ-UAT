#!/usr/bin/env python3
"""
Backfill reliability graph: copy threat-source edges to observation-source edges.

For converged work signals, threat id == observation id. This script upserts
equivalent edges with ``source_type=observation`` for each active edge where
``source_type=threat``.

Usage:
    cd backend && python3 scripts/backfill_graph_threat_to_observation_edges.py
    cd backend && python3 scripts/backfill_graph_threat_to_observation_edges.py --execute
    cd backend && python3 scripts/backfill_graph_threat_to_observation_edges.py --execute --delete-threat-edges
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_ROOT)

from database import client, DEFAULT_DB_NAME  # noqa: E402
from services.reliability_graph_core import COLLECTION, EDGE_STATUS_RETIRED  # noqa: E402

logger = logging.getLogger(__name__)


@dataclass
class BackfillStats:
    threat_edges_scanned: int = 0
    observation_edges_upserted: int = 0
    skipped_self_links: int = 0
    threat_edges_retired: int = 0
    errors: int = 0
    error_samples: List[str] = field(default_factory=list)

    def record_error(self, message: str, *, max_samples: int = 20) -> None:
        self.errors += 1
        if len(self.error_samples) < max_samples:
            self.error_samples.append(message)
        logger.error(message)


def should_skip_edge(edge: Dict[str, Any]) -> bool:
    """Skip observation→threat self-links when ids are converged."""
    target_type = edge.get("target_type")
    target_id = edge.get("target_id")
    source_id = edge.get("source_id")
    if target_type == "threat" and target_id == source_id:
        return True
    if target_type == "observation" and target_id == source_id:
        return True
    return False


async def copy_threat_edge_to_observation(
    db,
    edge: Dict[str, Any],
    *,
    dry_run: bool,
    stats: BackfillStats,
) -> None:
    from services.reliability_graph_core import upsert_edge

    source_id = edge.get("source_id")
    if not source_id:
        stats.record_error(f"Edge missing source_id: {edge.get('id')}")
        return

    if should_skip_edge(edge):
        stats.skipped_self_links += 1
        return

    if dry_run:
        stats.observation_edges_upserted += 1
        return

    await upsert_edge(
        source_type="observation",
        source_id=source_id,
        relation=edge.get("relation"),
        target_type=edge.get("target_type"),
        target_id=edge.get("target_id"),
        equipment_type_id=edge.get("equipment_type_id"),
        equipment_id=edge.get("equipment_id"),
        tenant_id=edge.get("tenant_id"),
        metadata=edge.get("metadata"),
        status=edge.get("status", "active"),
    )
    stats.observation_edges_upserted += 1


async def retire_threat_edge(db, edge: Dict[str, Any], *, dry_run: bool, stats: BackfillStats) -> None:
    if dry_run:
        stats.threat_edges_retired += 1
        return
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    await db[COLLECTION].update_one(
        {"_id": edge["_id"]},
        {"$set": {"status": EDGE_STATUS_RETIRED, "retired_at": now, "updated_at": now}},
    )
    stats.threat_edges_retired += 1


async def run_backfill(
    *,
    dry_run: bool = True,
    delete_threat_edges: bool = False,
    tenant_id: Optional[str] = None,
) -> BackfillStats:
    db = client[DEFAULT_DB_NAME]
    stats = BackfillStats()

    query: Dict[str, Any] = {
        "source_type": "threat",
        "status": {"$ne": EDGE_STATUS_RETIRED},
    }
    if tenant_id:
        query["tenant_id"] = tenant_id

    cursor = db[COLLECTION].find(query)
    async for edge in cursor:
        stats.threat_edges_scanned += 1
        try:
            await copy_threat_edge_to_observation(db, edge, dry_run=dry_run, stats=stats)
            if delete_threat_edges:
                await retire_threat_edge(db, edge, dry_run=dry_run, stats=stats)
        except Exception as exc:
            stats.record_error(f"Edge {edge.get('id')}: {exc}")

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy threat reliability_edges to observation-source equivalents.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply changes (default is dry-run)",
    )
    parser.add_argument(
        "--delete-threat-edges",
        action="store_true",
        help="Retire threat-source edges after copying (requires --execute)",
    )
    parser.add_argument("--tenant-id", default=None, help="Limit to a single tenant")
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)

    dry_run = not args.execute
    if args.delete_threat_edges and dry_run:
        print("--delete-threat-edges requires --execute", file=sys.stderr)
        return 2

    if dry_run:
        logger.info("DRY RUN — pass --execute to apply changes")

    stats = await run_backfill(
        dry_run=dry_run,
        delete_threat_edges=args.delete_threat_edges,
        tenant_id=args.tenant_id,
    )

    print(
        f"Scanned {stats.threat_edges_scanned} threat edges; "
        f"upserted {stats.observation_edges_upserted} observation edges; "
        f"skipped {stats.skipped_self_links} self-links; "
        f"retired {stats.threat_edges_retired} threat edges; "
        f"errors {stats.errors}"
    )
    if stats.error_samples:
        for sample in stats.error_samples:
            print(f"  error: {sample}")

    return 1 if stats.errors else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
