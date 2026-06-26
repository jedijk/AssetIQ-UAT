"""
Production dashboard service — thin facade (Wave 7 convergence).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from services.production_dashboard_scope import resolve_production_dashboard_scope
from services.production_dashboard_forms import build_production_dashboard_forms
from services.production_dashboard_ingest import merge_production_dashboard_ingest


async def build_production_dashboard(
    current_user: dict,
    *,
    date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    shift: Optional[str] = None,
) -> Dict[str, Any]:
    scope = await resolve_production_dashboard_scope(
        current_user,
        date=date,
        from_date=from_date,
        to_date=to_date,
        shift=shift,
    )
    form_data = await build_production_dashboard_forms(scope)
    return await merge_production_dashboard_ingest(scope, form_data)


async def get_or_compute_production_dashboard(
    current_user: dict,
    *,
    date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    shift: Optional[str] = None,
) -> Dict[str, Any]:
    from services.production_dashboard_materializer import (
        dashboard_cache_key,
        get_cached_production_dashboard,
        store_production_dashboard_snapshot,
    )

    cache_key = dashboard_cache_key(
        date=date, from_date=from_date, to_date=to_date, shift=shift,
    )
    cached = await get_cached_production_dashboard(current_user, cache_key)
    if cached:
        return cached
    payload = await build_production_dashboard(
        current_user,
        date=date,
        from_date=from_date,
        to_date=to_date,
        shift=shift,
    )
    await store_production_dashboard_snapshot(current_user, cache_key, payload)
    return payload
