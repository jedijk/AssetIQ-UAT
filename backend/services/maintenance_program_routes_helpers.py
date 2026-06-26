"""Maintenance program routes — shared schedule-refresh helpers."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from services.maintenance_scheduler_sync import (
    refresh_equipment_schedule,
    refresh_schedule_after_v2_task_active_toggle,
)

logger = logging.getLogger(__name__)


def current_user_id(current_user: dict) -> str:
    return current_user.get("id") or current_user.get("user_id") or current_user.get("email", "unknown")


async def refresh_equipment_schedule_after_change(
    equipment_id: str,
    current_user: dict,
) -> Optional[Dict[str, Any]]:
    try:
        return await refresh_equipment_schedule(
            equipment_id,
            user_id=current_user_id(current_user),
        )
    except Exception:
        logger.exception("Failed to refresh maintenance schedule for %s", equipment_id)
        return None


async def refresh_equipment_schedule_after_active_toggle(
    equipment_id: str,
    *,
    enable: bool,
    v2_task_id: str,
    template_id: Optional[str] = None,
    current_user: dict,
) -> Optional[Dict[str, Any]]:
    """Sync schedule rows for a single v2 program task enable/disable."""
    try:
        return await refresh_schedule_after_v2_task_active_toggle(
            equipment_id,
            v2_task_id,
            enable=enable,
            template_id=template_id,
            user_id=current_user_id(current_user),
        )
    except Exception:
        logger.exception(
            "Failed to refresh schedule after active toggle for %s task %s",
            equipment_id,
            v2_task_id,
        )
        return None
