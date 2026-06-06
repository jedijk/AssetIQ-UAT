"""Strict-mode helpers for reliability graph sync failures."""
from __future__ import annotations

import os


def graph_sync_strict() -> bool:
    """
    When True, graph sync failures propagate instead of log-and-continue.

    Enabled when ``RELIABILITY_GRAPH_STRICT=true`` or ``RELIABILITY_GRAPH_AUDIT_MODE=true``,
    or by default on UAT/production Railway environments.
    """
    if os.environ.get("RELIABILITY_GRAPH_STRICT", "").lower() in ("1", "true", "yes"):
        return True
    if os.environ.get("RELIABILITY_GRAPH_AUDIT_MODE", "").lower() in ("1", "true", "yes"):
        return True
    env = (
        os.getenv("RAILWAY_ENVIRONMENT")
        or os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or ""
    ).lower()
    return env in ("production", "prod", "uat", "staging")
