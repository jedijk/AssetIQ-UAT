"""RIL dashboard service — Wave 8 convergence."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from services.ril_dashboard_materializer import get_or_compute_ril_dashboard


async def get_dashboard_stats(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_or_compute_ril_dashboard(user, owner_id)
    stats = cached.get("stats") or {}
    return {
        "success": True,
        "stats": stats,
        "generated_at": cached.get("generated_at") or datetime.now(timezone.utc).isoformat(),
    }


async def get_executive_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_or_compute_ril_dashboard(user, owner_id)
    return cached.get("executive") or {}


async def get_intelligence_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_or_compute_ril_dashboard(user, owner_id)
    return cached.get("intelligence") or {}


async def get_data_quality_dashboard(user: dict, owner_id: Optional[str] = None) -> Dict[str, Any]:
    cached = await get_or_compute_ril_dashboard(user, owner_id)
    return cached.get("data_quality") or {}
