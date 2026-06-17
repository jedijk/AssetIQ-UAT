"""Shared helpers for visual management board services."""
from __future__ import annotations

from datetime import datetime, timezone

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
