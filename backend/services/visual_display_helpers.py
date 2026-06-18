"""Shared constants for visual display device pairing."""
from __future__ import annotations

from datetime import datetime, timezone

DEVICES_COLLECTION = "visual_display_devices"
PAIRINGS_COLLECTION = "visual_display_pairings"
EVENTS_COLLECTION = "visual_display_events"

PAIRING_EXPIRY_SECONDS = 600
DEVICE_OFFLINE_THRESHOLD_SECONDS = 300


def derive_device_status(device: dict) -> str:
    if device.get("status") == "disabled":
        return "disabled"
    last_seen = device.get("last_seen")
    if not last_seen:
        return "inactive"
    try:
        seen = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
        if seen.tzinfo is None:
            seen = seen.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - seen
        if delta.total_seconds() <= DEVICE_OFFLINE_THRESHOLD_SECONDS:
            return "online"
        return "offline"
    except Exception:
        return "inactive"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
