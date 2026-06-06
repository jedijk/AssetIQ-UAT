"""
Tenant ID schema helpers — pilot for multi-tenant readiness.

Pilot collections store optional ``tenant_id`` (company_id / organization_id from JWT).
Existing collections remain unchanged until a migration phase.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Collections created after the tenant pilot that should always carry tenant_id.
PILOT_COLLECTIONS = frozenset({
    "work_item_projections",
    "reliability_context_snapshots",
    "background_jobs",
    "audit_log",
})

DEFAULT_TENANT_FIELD = "tenant_id"


def tenant_id_from_user(user: Optional[dict]) -> Optional[str]:
    if not user:
        return None
    return user.get("company_id") or user.get("organization_id") or None


def with_tenant_id(doc: Dict[str, Any], user: Optional[dict]) -> Dict[str, Any]:
    """Attach tenant_id to a new document when the user carries org context."""
    tid = tenant_id_from_user(user)
    if tid:
        doc[DEFAULT_TENANT_FIELD] = tid
    return doc


def tenant_filter(user: Optional[dict]) -> Dict[str, Any]:
    """Mongo filter fragment scoping reads to the user's tenant when present."""
    tid = tenant_id_from_user(user)
    if tid:
        return {DEFAULT_TENANT_FIELD: tid}
    return {}


def ensure_pilot_indexes(db) -> None:
    """Create tenant-scoped indexes on pilot collections (idempotent)."""
    for name in PILOT_COLLECTIONS:
        db[name].create_index(
            [(DEFAULT_TENANT_FIELD, 1), ("user_id", 1), ("updated_at", -1)],
            name=f"{name}_tenant_user_updated",
            background=True,
        )
