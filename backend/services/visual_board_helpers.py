"""Shared helpers for visual management board services."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

VMB_DISPLAY_USER_ID = "vmb-display"


def is_vmb_display_user(user: Optional[dict]) -> bool:
    """True for the synthetic kiosk/TV read-only user (tenant-wide data, no JWT)."""
    if not user:
        return False
    return user.get("id") == VMB_DISPLAY_USER_ID or user.get("vmb_display") is True

BOARDS_COLLECTION = "visual_boards"
VERSIONS_COLLECTION = "visual_board_versions"
TOKENS_COLLECTION = "visual_board_tokens"
SCREENS_COLLECTION = "visual_board_screens"
TEMPLATES_COLLECTION = "visual_board_templates"
ANALYTICS_COLLECTION = "visual_board_analytics"

SCREEN_OFFLINE_THRESHOLD_SECONDS = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
