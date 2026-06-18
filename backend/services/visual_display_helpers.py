"""Shared constants for visual display device pairing."""
from __future__ import annotations

from datetime import datetime, timezone

DEVICES_COLLECTION = "visual_display_devices"
PAIRINGS_COLLECTION = "visual_display_pairings"
EVENTS_COLLECTION = "visual_display_events"

PAIRING_EXPIRY_SECONDS = 600


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
