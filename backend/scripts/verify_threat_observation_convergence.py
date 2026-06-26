#!/usr/bin/env python3
"""
Gate: every threat must have a matching observation with the same primary id.

Reports:
  - threats missing same-id observations
  - orphan observations (same-id doc with no matching threat)
  - legacy_threat_id duplicates (multiple obs pointing at one threat)

Exit code 0 when gate passes, non-zero otherwise.

Usage:
    cd backend && python scripts/verify_threat_observation_convergence.py
    cd backend && MONGO_URL=... python scripts/verify_threat_observation_convergence.py --tenant-id co-1
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_ROOT)

from database import client, DEFAULT_DB_NAME  # noqa: E402
from services.tenant_schema import DEFAULT_TENANT_FIELD  # noqa: E402


@dataclass
class ConvergenceReport:
    threats_total: int = 0
    observations_total: int = 0
    missing_observations: List[str] = field(default_factory=list)
    orphan_observations: List[str] = field(default_factory=list)
    legacy_threat_id_duplicates: Dict[str, List[str]] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return (
            not self.missing_observations
            and not self.orphan_observations
            and not self.legacy_threat_id_duplicates
        )

    def failure_count(self) -> int:
        return (
            len(self.missing_observations)
            + len(self.orphan_observations)
            + sum(len(ids) for ids in self.legacy_threat_id_duplicates.values())
        )


def tenant_query(tenant_id: Optional[str]) -> Dict[str, Any]:
    if tenant_id:
        return {DEFAULT_TENANT_FIELD: tenant_id}
    return {}


def analyze_convergence(
    threat_ids: Set[str],
    observations: List[Dict[str, Any]],
) -> ConvergenceReport:
    """Pure analysis used by the verify gate and unit tests."""
    report = ConvergenceReport(
        threats_total=len(threat_ids),
        observations_total=len(observations),
    )

    obs_by_id: Dict[str, Dict[str, Any]] = {}
    legacy_index: Dict[str, List[str]] = defaultdict(list)

    for obs in observations:
        obs_id = obs.get("id")
        if obs_id:
            obs_by_id[str(obs_id)] = obs
        legacy_tid = obs.get("legacy_threat_id")
        if legacy_tid:
            legacy_index[str(legacy_tid)].append(str(obs_id or ""))

    for threat_id in sorted(threat_ids):
        if threat_id not in obs_by_id:
            report.missing_observations.append(threat_id)

    for obs_id, obs in obs_by_id.items():
        if obs_id not in threat_ids:
            report.orphan_observations.append(obs_id)

    for legacy_tid, obs_ids in legacy_index.items():
        unique_ids = sorted({oid for oid in obs_ids if oid})
        if legacy_tid in threat_ids and legacy_tid in obs_by_id:
            extras = [oid for oid in unique_ids if oid != legacy_tid]
            if extras:
                report.legacy_threat_id_duplicates[legacy_tid] = extras
        elif len(unique_ids) > 1:
            report.legacy_threat_id_duplicates[legacy_tid] = unique_ids

    return report


async def verify_threat_observation_convergence(
    db,
    *,
    tenant_id: Optional[str] = None,
    batch_size: int = 500,
) -> ConvergenceReport:
    query = tenant_query(tenant_id)

    threat_docs = await db.threats.find(query, {"_id": 0, "id": 1}).to_list(None)
    threat_ids = {str(t["id"]) for t in threat_docs if t.get("id")}

    observations: List[Dict[str, Any]] = []
    cursor = db.observations.find(query, {"_id": 0, "id": 1, "legacy_threat_id": 1}).batch_size(
        max(1, batch_size)
    )
    async for obs in cursor:
        observations.append(obs)

    return analyze_convergence(threat_ids, observations)


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify threat→observation convergence (same-id gate)",
    )
    parser.add_argument(
        "--tenant-id",
        dest="tenant_id",
        default=os.environ.get("TENANT_ID"),
        help="Scope to a single tenant (default: all tenants)",
    )
    parser.add_argument("--batch-size", type=int, default=500)
    return parser.parse_args(argv)


def format_report(report: ConvergenceReport) -> str:
    lines = [
        f"Threats: {report.threats_total}",
        f"Observations: {report.observations_total}",
        f"Missing same-id observations: {len(report.missing_observations)}",
        f"Orphan observations (no matching threat): {len(report.orphan_observations)}",
        f"legacy_threat_id duplicate groups: {len(report.legacy_threat_id_duplicates)}",
    ]
    if report.missing_observations:
        sample = report.missing_observations[:10]
        lines.append(f"  sample missing: {', '.join(sample)}")
    if report.orphan_observations:
        sample = report.orphan_observations[:10]
        lines.append(f"  sample orphans: {', '.join(sample)}")
    if report.legacy_threat_id_duplicates:
        for tid, dup_ids in list(report.legacy_threat_id_duplicates.items())[:5]:
            lines.append(f"  threat {tid}: duplicate obs ids {dup_ids}")
    return "\n".join(lines)


async def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    db_name = os.environ.get("DB_NAME", DEFAULT_DB_NAME)
    db = client[db_name]

    print(f"Database: {db_name}")
    print(f"Tenant: {args.tenant_id or '(all)'}")

    report = await verify_threat_observation_convergence(
        db,
        tenant_id=args.tenant_id,
        batch_size=max(1, args.batch_size),
    )

    print(format_report(report))

    if report.passed:
        print("\nOK: threat→observation convergence gate passed")
        return 0

    print(f"\nFAIL: {report.failure_count()} convergence issue(s)", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
