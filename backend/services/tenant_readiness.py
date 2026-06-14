"""
Tenant backfill readiness helpers — Phase 2 (Security & tenancy).

Shared by phase0/phase2 report scripts and cutover checks.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from services.tenant_schema import (
    DEFAULT_TENANT_FIELD,
    WAVE1_COLLECTIONS,
    WAVE2_COLLECTIONS,
    WAVE3_COLLECTIONS,
)


async def collection_tenant_coverage(db, name: str) -> Dict[str, Any]:
    """Return tenant_id coverage stats for one collection."""
    total = await db[name].count_documents({})
    if total == 0:
        return {
            "collection": name,
            "total": 0,
            "missing": 0,
            "pct": 100.0,
            "complete": True,
        }
    missing = await db[name].count_documents({DEFAULT_TENANT_FIELD: {"$exists": False}})
    pct = round(100 * (total - missing) / total, 1)
    return {
        "collection": name,
        "total": total,
        "missing": missing,
        "pct": pct,
        "complete": missing == 0,
    }


async def wave_coverage(db, collections: frozenset) -> Tuple[bool, List[Dict[str, Any]]]:
    """Return (all_complete, per-collection rows) for a wave."""
    rows: List[Dict[str, Any]] = []
    all_ok = True
    for name in sorted(collections):
        row = await collection_tenant_coverage(db, name)
        rows.append(row)
        if row["total"] > 0 and not row["complete"]:
            all_ok = False
    return all_ok, rows


async def phase2_exit_ready(db) -> Tuple[bool, List[str]]:
    """
    Phase 2 exit gate: Wave 1 + Wave 2 fully backfilled (prerequisite for TENANT_STRICT_MODE).
    """
    wave1_ok, _ = await wave_coverage(db, WAVE1_COLLECTIONS)
    wave2_ok, _ = await wave_coverage(db, WAVE2_COLLECTIONS)
    gaps: List[str] = []
    if not wave1_ok:
        gaps.append("Wave 1 collections missing tenant_id — run backfill_tenant_id.py --wave1")
    if not wave2_ok:
        gaps.append("Wave 2 collections missing tenant_id — run backfill_tenant_id.py --wave2")
    return wave1_ok and wave2_ok, gaps


def format_coverage_lines(rows: List[Dict[str, Any]]) -> str:
    lines = []
    for row in rows:
        lines.append(
            f"  {row['collection']}: {row['total']} docs, {row['pct']}% with tenant_id"
        )
    return "\n".join(lines)
