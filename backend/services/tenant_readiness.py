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
    WAVE4_COLLECTIONS,
    WAVE5_COLLECTIONS,
    WAVE6_COLLECTIONS,
    WAVE7_COLLECTIONS,
    WAVE8_COLLECTIONS,
    WAVE9_COLLECTIONS,
    WAVE10_COLLECTIONS,
    WAVE11_COLLECTIONS,
    WAVE_COLLECTIONS,
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


async def wave4_exit_ready(db) -> Tuple[bool, List[str]]:
    """Wave 4 exit gate: telemetry and template collections backfilled."""
    wave4_ok, _ = await wave_coverage(db, WAVE4_COLLECTIONS)
    gaps: List[str] = []
    if not wave4_ok:
        gaps.append("Wave 4 collections missing tenant_id — run backfill_tenant_id.py --wave4")
    return wave4_ok, gaps


async def wave5_exit_ready(db) -> Tuple[bool, List[str]]:
    """Wave 5 exit gate: preferences, graph impacts, granulometry backfilled."""
    wave5_ok, _ = await wave_coverage(db, WAVE5_COLLECTIONS)
    gaps: List[str] = []
    if not wave5_ok:
        gaps.append("Wave 5 collections missing tenant_id — run backfill_tenant_id.py --wave5")
    return wave5_ok, gaps


async def strict_mode_ready(db) -> Tuple[bool, List[str]]:
    """Full strict-mode readiness across all tenant wave collections (1–11)."""
    gaps: List[str] = []
    all_ok = True
    wave_sets = [
        ("Wave 1", WAVE1_COLLECTIONS, "--wave1"),
        ("Wave 2", WAVE2_COLLECTIONS, "--wave2"),
        ("Wave 3", WAVE3_COLLECTIONS, "--wave3"),
        ("Wave 4", WAVE4_COLLECTIONS, "--wave4"),
        ("Wave 5", WAVE5_COLLECTIONS, "--wave5"),
        ("Wave 6", WAVE6_COLLECTIONS, "--wave6"),
        ("Wave 7", WAVE7_COLLECTIONS, "--wave7"),
        ("Wave 8", WAVE8_COLLECTIONS, "--wave8"),
        ("Wave 9", WAVE9_COLLECTIONS, "--wave9"),
        ("Wave 10", WAVE10_COLLECTIONS, "--wave10"),
        ("Wave 11", WAVE11_COLLECTIONS, "--wave11"),
    ]
    for label, collections, flag in wave_sets:
        ok, _ = await wave_coverage(db, collections)
        if not ok:
            all_ok = False
            gaps.append(f"{label} collections missing tenant_id — run backfill_tenant_id.py {flag}")
    return all_ok, gaps


async def all_waves_coverage(db) -> Tuple[bool, List[Dict[str, Any]]]:
    """Return coverage for every collection in WAVE_COLLECTIONS."""
    return await wave_coverage(db, WAVE_COLLECTIONS)


def format_coverage_lines(rows: List[Dict[str, Any]]) -> str:
    lines = []
    for row in rows:
        lines.append(
            f"  {row['collection']}: {row['total']} docs, {row['pct']}% with tenant_id"
        )
    return "\n".join(lines)
