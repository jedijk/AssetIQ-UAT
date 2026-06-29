"""RIL dashboard service — Wave 8 convergence."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from database import db
from services.ril_dashboard_build import (
    build_ril_data_quality_payload,
    build_ril_intelligence_payload,
)
from services.ril_dashboard_materializer import (
    get_cached_ril_dashboard,
    get_or_compute_ril_dashboard,
)


def _owner_id(user: dict, owner_id: Optional[str]) -> str:
    return owner_id or user.get("owner_id") or user.get("id")


async def _cached_slice_or_build(
    user: dict,
    owner_id: Optional[str],
    slice_key: str,
    build_fn: Callable[..., Any],
) -> Dict[str, Any]:
    cached = await get_cached_ril_dashboard(user)
    if cached and cached.get(slice_key) is not None:
        return cached[slice_key]
    oid = _owner_id(user, owner_id)
    return await build_fn(user, oid)


async def get_dashboard_stats(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_cached_ril_dashboard(user)
    if cached and cached.get("stats") is not None:
        return {
            "success": True,
            "stats": cached["stats"],
            "generated_at": cached.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        }

    from services.ril_service import RILService

    oid = _owner_id(user, owner_id)
    stats = await RILService(db).get_dashboard_stats(oid)
    return {
        "success": True,
        "stats": stats,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_executive_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_or_compute_ril_dashboard(user, owner_id)
    return cached.get("executive") or {}


async def get_intelligence_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    return await _cached_slice_or_build(
        user, owner_id, "intelligence", build_ril_intelligence_payload
    ) or {}


async def get_data_quality_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    return await _cached_slice_or_build(
        user, owner_id, "data_quality", build_ril_data_quality_payload
    ) or {}
