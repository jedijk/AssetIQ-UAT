"""
Tenant isolation audit registry — Wave 2 enterprise hardening.

Used by wave2_tenant_isolation_report.py and readiness checks.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from services.tenant_schema import (
    PILOT_COLLECTIONS,
    WAVE1_COLLECTIONS,
    WAVE2_COLLECTIONS,
    WAVE3_COLLECTIONS,
    WAVE4_COLLECTIONS,
    WAVE5_COLLECTIONS,
    WAVE_COLLECTIONS,
)

# Collections without tenant wave assignment (review backlog).
UNSCOPED_BACKLOG = frozenset()


def wave_for_collection(name: str) -> Optional[str]:
    if name in PILOT_COLLECTIONS:
        return "pilot"
    if name in WAVE1_COLLECTIONS:
        return "wave1"
    if name in WAVE2_COLLECTIONS:
        return "wave2"
    if name in WAVE3_COLLECTIONS:
        return "wave3"
    if name in WAVE4_COLLECTIONS:
        return "wave4"
    if name in WAVE5_COLLECTIONS:
        return "wave5"
    if name in UNSCOPED_BACKLOG:
        return "backlog"
    return None


def collection_audit_entry(name: str) -> Dict[str, Any]:
    wave = wave_for_collection(name)
    tenant_scoped = wave in ("pilot", "wave1", "wave2", "wave3", "wave4", "wave5")
    return {
        "collection": name,
        "wave": wave or "unknown",
        "tenant_scoped": tenant_scoped,
        "index_expected": tenant_scoped,
        "strict_mode_compatible": tenant_scoped,
        "installation_scoped": name in ("production_logs", "log_ingestion_jobs", "granulometry_records"),
    }


def all_audited_collections(extra: Optional[Set[str]] = None) -> List[str]:
    names = set(WAVE_COLLECTIONS) | UNSCOPED_BACKLOG
    if extra:
        names |= extra
    return sorted(names)


async def index_exists(db, collection: str, key: str = "tenant_id") -> bool:
    try:
        async for idx in db[collection].list_indexes():
            spec = idx.get("key") or {}
            if key in spec:
                return True
    except Exception:
        return False
    return False


async def build_isolation_report(db, extra_collections: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    """Build per-collection tenant isolation status from live DB metadata."""
    rows: List[Dict[str, Any]] = []
    for name in all_audited_collections(extra_collections):
        entry = collection_audit_entry(name)
        total = await db[name].count_documents({})
        missing = 0
        if entry["tenant_scoped"] and total > 0:
            missing = await db[name].count_documents({"tenant_id": {"$exists": False}})
        entry.update({
            "total_documents": total,
            "missing_tenant_id": missing,
            "backfill_complete": missing == 0 or total == 0,
            "index_exists": await index_exists(db, name) if entry["index_expected"] else None,
        })
        rows.append(entry)
    return rows
