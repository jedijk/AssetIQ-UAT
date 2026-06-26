"""Tenant scope helpers for maintenance scheduler/program services."""
from __future__ import annotations

from typing import Any, Dict, Optional

from services.tenant_schema import BACKFILL_TENANT_ID, merge_tenant_filter


def maintenance_scoped(user: Optional[dict], query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Apply migration-safe tenant read filter for request-scoped maintenance queries."""
    return merge_tenant_filter(query or {}, user)


def tenant_id_from_record(record: Optional[Dict[str, Any]]) -> Optional[str]:
    if not record:
        return None
    return record.get("tenant_id") or record.get("company_id")


def maintenance_scoped_tenant(
    tenant_id: Optional[str],
    query: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Scope queries in background sync paths that carry tenant_id on a parent document."""
    if not tenant_id:
        return query or {}
    return merge_tenant_filter(query or {}, {"company_id": tenant_id})


def maintenance_scoped_job(
    query: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Scope background scheduler sync reads when no request user is available."""
    tid = tenant_id or BACKFILL_TENANT_ID
    if not tid:
        return query or {}
    return merge_tenant_filter(query or {}, {"company_id": tid})
