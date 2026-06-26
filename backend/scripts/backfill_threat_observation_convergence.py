#!/usr/bin/env python3
"""
Backfill canonical observations for legacy threats (same primary id).

For each threat document:
  1. Upsert an observation with the same ``id`` via ``observation_doc_from_threat``
  2. Remove duplicate observations whose ``legacy_threat_id`` points at that threat
     when a same-id observation exists (prefer same-id doc)

Usage:
    cd backend && python scripts/backfill_threat_observation_convergence.py
    cd backend && python scripts/backfill_threat_observation_convergence.py --execute
    cd backend && MONGO_URL=... python scripts/backfill_threat_observation_convergence.py --tenant-id co-1 --execute
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
from services.tenant_schema import DEFAULT_TENANT_FIELD, merge_tenant_filter  # noqa: E402
from services.work_signal_lifecycle import observation_doc_from_threat  # noqa: E402

logger = logging.getLogger(__name__)


@dataclass
class BackfillStats:
    threats_scanned: int = 0
    observations_upserted: int = 0
    legacy_duplicates_removed: int = 0
    skipped_no_id: int = 0
    errors: int = 0
    error_samples: List[str] = field(default_factory=list)

    def record_error(self, message: str, *, max_samples: int = 20) -> None:
        self.errors += 1
        if len(self.error_samples) < max_samples:
            self.error_samples.append(message)
        logger.error(message)


def tenant_user(tenant_id: Optional[str]) -> Optional[dict]:
    if not tenant_id:
        return None
    return {"company_id": tenant_id}


def threat_query(*, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    if tenant_id:
        return {DEFAULT_TENANT_FIELD: tenant_id}
    return {}


async def remove_legacy_duplicate_observations(
    db,
    signal_id: str,
    *,
    tenant_id: Optional[str] = None,
    dry_run: bool = True,
) -> int:
    """Delete observations with legacy_threat_id=signal_id but a different primary id."""
    user = tenant_user(tenant_id)
    filt = merge_tenant_filter(
        {"legacy_threat_id": signal_id, "id": {"$ne": signal_id}},
        user,
    )
    legacy_dups = await db.observations.find(filt, {"_id": 0, "id": 1}).to_list(1000)
    removed = 0
    for dup in legacy_dups:
        dup_id = dup.get("id")
        if not dup_id:
            continue
        removed += 1
        if not dry_run:
            await db.observations.delete_one(
                merge_tenant_filter({"id": dup_id}, user),
            )
    return removed


async def upsert_observation_for_threat(
    db,
    threat: Dict[str, Any],
    *,
    tenant_id: Optional[str] = None,
    dry_run: bool = True,
) -> bool:
    """Upsert same-id observation for a threat. Returns False when threat has no id."""
    signal_id = threat.get("id")
    if not signal_id:
        return False

    user = tenant_user(tenant_id or threat.get(DEFAULT_TENANT_FIELD))
    doc = observation_doc_from_threat(threat, user=user)

    if not dry_run:
        await db.observations.update_one(
            merge_tenant_filter({"id": signal_id}, user),
            {"$set": {k: v for k, v in doc.items() if k != "_id"}},
            upsert=True,
        )
    return True


async def backfill_threat_observation_convergence(
    db,
    *,
    tenant_id: Optional[str] = None,
    dry_run: bool = True,
    batch_size: int = 100,
    limit: Optional[int] = None,
) -> BackfillStats:
    stats = BackfillStats()
    query = threat_query(tenant_id=tenant_id)
    cursor = db.threats.find(query, {"_id": 0}).batch_size(max(1, batch_size))

    async for threat in cursor:
        if limit is not None and stats.threats_scanned >= limit:
            break

        stats.threats_scanned += 1
        signal_id = threat.get("id")
        if not signal_id:
            stats.skipped_no_id += 1
            continue

        try:
            upserted = await upsert_observation_for_threat(
                db,
                threat,
                tenant_id=tenant_id,
                dry_run=dry_run,
            )
            if upserted:
                stats.observations_upserted += 1

            removed = await remove_legacy_duplicate_observations(
                db,
                signal_id,
                tenant_id=tenant_id or threat.get(DEFAULT_TENANT_FIELD),
                dry_run=dry_run,
            )
            stats.legacy_duplicates_removed += removed
        except Exception as exc:
            stats.record_error(f"threat {signal_id}: {exc}")

    return stats


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill same-id observations for legacy threats",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply writes (default is dry-run)",
    )
    parser.add_argument(
        "--tenant-id",
        dest="tenant_id",
        default=os.environ.get("TENANT_ID"),
        help="Scope to a single tenant (default: all tenants)",
    )
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max threats to process (sampling)",
    )
    return parser.parse_args(argv)


async def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args(argv)
    dry_run = not args.execute
    db_name = os.environ.get("DB_NAME", DEFAULT_DB_NAME)
    db = client[db_name]

    print(f"Database: {db_name}")
    print(f"Tenant: {args.tenant_id or '(all)'}")
    print(f"Mode: {'DRY RUN' if dry_run else 'EXECUTE'}")

    stats = await backfill_threat_observation_convergence(
        db,
        tenant_id=args.tenant_id,
        dry_run=dry_run,
        batch_size=max(1, args.batch_size),
        limit=args.limit if args.limit and args.limit > 0 else None,
    )

    print(
        f"Scanned {stats.threats_scanned} threats, "
        f"upserted {stats.observations_upserted} observations, "
        f"removed {stats.legacy_duplicates_removed} legacy duplicates, "
        f"skipped {stats.skipped_no_id} without id, "
        f"errors {stats.errors}"
    )
    if stats.error_samples:
        for sample in stats.error_samples:
            print(f"  error: {sample}")

    return 1 if stats.errors else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
