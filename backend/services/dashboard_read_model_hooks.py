"""
Central invalidation for executive dashboard read models — Platform 1.0 WS6.

Call after operational mutations that affect dashboard KPIs or snapshots.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def invalidate_dashboard_read_models(
    *,
    user: Optional[dict] = None,
    reason: str = "",
) -> None:
    """Enqueue refresh for all tenant-scoped dashboard read models."""
    from services.projection_dispatch import (
        invalidate_analytics_dashboard,
        invalidate_asset_health,
        invalidate_executive_dashboard,
        invalidate_executive_kpi,
        invalidate_insights_summary,
        invalidate_production_dashboard,
        invalidate_ril_dashboard,
        invalidate_work_execution_kpi,
    )

    tasks = [
        invalidate_executive_kpi(user=user, reason=reason),
        invalidate_executive_dashboard(user=user, reason=reason),
        invalidate_work_execution_kpi(user=user, reason=reason),
        invalidate_ril_dashboard(user=user, reason=reason),
        invalidate_production_dashboard(user=user, reason=reason),
        invalidate_insights_summary(user=user, reason=reason),
        invalidate_analytics_dashboard(user=user, reason=reason),
        invalidate_asset_health(user=user, reason=reason),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            logger.warning("dashboard read model invalidation failed: %s", result)


async def notify_dashboard_data_changed(
    user: dict,
    *,
    reason: str = "",
    invalidate_work_items: bool = True,
) -> None:
    """Hook for operational mutations that affect dashboard read models."""
    try:
        await invalidate_dashboard_read_models(user=user, reason=reason)
    except Exception as exc:
        logger.warning("dashboard read model invalidation failed: %s", exc)

    if not invalidate_work_items:
        return
    user_id = user.get("id") or user.get("user_id")
    if not user_id:
        return
    try:
        from services.work_item_projection import invalidate_user_projections

        await invalidate_user_projections(
            user_id,
            tenant_id=user.get("company_id"),
        )
    except Exception as exc:
        logger.warning("work item projection invalidation failed: %s", exc)
