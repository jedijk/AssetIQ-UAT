"""Reliability graph sync for PM Import — routes through dispatch_graph_sync."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


async def sync_pm_import_graph_edge(
    task: Dict[str, Any],
    task_id: str,
    failure_mode_id: str,
    apply_mode: str,
) -> None:
    """Record PM Import → failure mode linkage in the reliability graph."""
    try:
        from services.reliability_graph import dispatch_graph_sync

        equip_match = task.get("equipment_match") or {}
        await dispatch_graph_sync(
            "sync_edge_for_pm_import_task",
            f"pm_import:{task_id}",
            task_id=task_id,
            failure_mode_id=failure_mode_id,
            equipment_id=equip_match.get("equipment_id") or task.get("equipment_id"),
            equipment_type_id=equip_match.get("equipment_type_id"),
            apply_mode=apply_mode,
            tenant_id=task.get("tenant_id"),
        )
    except Exception as exc:
        logger.warning("pm import graph edge sync failed: %s", exc)
        from services.reliability_graph_strict import graph_sync_strict

        if graph_sync_strict():
            raise
