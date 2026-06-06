"""
Digital Twin API — time-travel reliability snapshots and graph state.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from routes.ril._auth import _ril_read
from services.reliability_snapshot_service import (
    _parse_iso8601,
    get_graph_at_time,
    get_snapshot_for_equipment,
)

router = APIRouter(prefix="/equipment", tags=["RIL Digital Twin"])


def _parse_at_param(at: Optional[str]) -> Optional[datetime]:
    if not at:
        return None
    try:
        return _parse_iso8601(at)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ISO8601 timestamp: {at}") from exc


@router.get("/{equipment_id}/reliability-snapshot")
async def get_reliability_snapshot(
    equipment_id: str,
    at: Optional[str] = Query(None, description="ISO8601 timestamp; omit for latest"),
    current_user: dict = Depends(_ril_read),
):
    """Return reliability snapshot at timestamp or latest."""
    parsed_at = _parse_at_param(at)
    snapshot = await get_snapshot_for_equipment(
        equipment_id,
        at=parsed_at,
        user=current_user,
    )
    if not snapshot:
        raise HTTPException(status_code=404, detail="No reliability snapshot found")
    return {
        "equipment_id": equipment_id,
        "snapshot": snapshot,
        "queried_at": (parsed_at or datetime.now(timezone.utc)).isoformat(),
    }


@router.get("/{equipment_id}/graph-at-time")
async def get_equipment_graph_at_time(
    equipment_id: str,
    at: str = Query(..., description="ISO8601 timestamp for graph state"),
    limit: int = Query(500, ge=1, le=1000),
    current_user: dict = Depends(_ril_read),
):
    """Active graph edges where created_at <= at and (retired_at null or > at)."""
    parsed_at = _parse_at_param(at)
    if parsed_at is None:
        raise HTTPException(status_code=400, detail="Query parameter 'at' is required")
    return await get_graph_at_time(
        equipment_id,
        parsed_at,
        user=current_user,
        limit=limit,
    )
