"""
Tenant registry helpers — status checks for auth and background jobs.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

TENANT_STATUS_ACTIVE = frozenset({"active", "trial"})
TENANT_STATUS_BLOCKED = frozenset({"suspended", "archived"})
VALID_TENANT_STATUSES = TENANT_STATUS_ACTIVE | TENANT_STATUS_BLOCKED

DEFAULT_MODULES = {
    "observation_iq": True,
    "strategy_iq": True,
    "scheduling_iq": True,
    "digital_operator": True,
    "spare_iq": True,
    "visual_boards": True,
    "ril_copilot": True,
    "executive_dashboards": True,
    "ai_risk_analysis": True,
}

MODULE_LABELS = {
    "observation_iq": "ObservationIQ",
    "strategy_iq": "StrategyIQ",
    "scheduling_iq": "SchedulingIQ",
    "digital_operator": "Digital Operator",
    "spare_iq": "Spares",
    "visual_boards": "Visual Boards",
    "ril_copilot": "RIL Copilot",
    "executive_dashboards": "Executive Dashboards",
    "ai_risk_analysis": "AI Risk Analysis",
}

_status_cache: dict[str, tuple[float, Optional[str]]] = {}
_CACHE_TTL_SECONDS = 30


def invalidate_tenant_status_cache(tenant_id: Optional[str] = None) -> None:
    if tenant_id:
        _status_cache.pop(tenant_id, None)
    else:
        _status_cache.clear()


async def get_tenant_record(tenant_id: str) -> Optional[dict]:
    if not tenant_id:
        return None
    from database import db

    return await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})


async def get_tenant_status(tenant_id: str) -> Optional[str]:
    """Return tenant status or None when no registry record exists (legacy tenants)."""
    if not tenant_id:
        return None

    import time

    now = time.time()
    cached = _status_cache.get(tenant_id)
    if cached and now < cached[0]:
        return cached[1]

    record = await get_tenant_record(tenant_id)
    status = record.get("status") if record else None
    _status_cache[tenant_id] = (now + _CACHE_TTL_SECONDS, status)
    return status


async def is_tenant_login_allowed(tenant_id: str) -> bool:
    status = await get_tenant_status(tenant_id)
    if status is None:
        return True
    return status in TENANT_STATUS_ACTIVE


async def should_skip_tenant_jobs(tenant_id: Optional[str]) -> bool:
    if not tenant_id:
        return False
    status = await get_tenant_status(tenant_id)
    if status is None:
        return False
    return status in TENANT_STATUS_BLOCKED
