"""
Production cutover flags for the 90-day foundation plan (Q1).

Centralizes environment detection and P0 configuration checks.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

from services.scheduler_config import should_read_legacy_maintenance_programs, should_sync_legacy_maintenance_programs
from services.tenant_schema import TENANT_STRICT_MODE
from services.reliability_graph_strict import graph_sync_strict


def deployed_environment() -> str:
    return (
        os.getenv("RAILWAY_ENVIRONMENT")
        or os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or "development"
    ).strip().lower()


def is_deployed_environment() -> bool:
    return deployed_environment() in ("production", "prod", "uat", "staging")


def default_work_items_source() -> str:
    """v2_instances on deployed envs; hybrid for local dev unless overridden."""
    if is_deployed_environment():
        return "v2_instances"
    return "hybrid"


def redis_required() -> bool:
    if os.environ.get("REQUIRE_REDIS", "").lower() in ("1", "true", "yes"):
        return True
    return is_deployed_environment()


def cutover_snapshot() -> Dict[str, Any]:
    from services.work_execution_config import work_items_source_mode

    return {
        "environment": deployed_environment(),
        "work_items_source": work_items_source_mode(),
        "read_legacy_maintenance_programs": should_read_legacy_maintenance_programs(),
        "sync_legacy_maintenance_programs": should_sync_legacy_maintenance_programs(),
        "tenant_strict_mode": TENANT_STRICT_MODE,
        "reliability_graph_strict": graph_sync_strict(),
        "redis_required": redis_required(),
        "redis_configured": bool(os.environ.get("REDIS_URL", "").strip()),
    }


def cutover_gaps() -> List[str]:
    """Return human-readable gaps vs 90-day checkpoint targets."""
    snap = cutover_snapshot()
    gaps: List[str] = []
    if snap["work_items_source"] != "v2_instances":
        gaps.append("WORK_ITEMS_SOURCE should be v2_instances")
    if snap["read_legacy_maintenance_programs"]:
        gaps.append("READ_LEGACY_MAINTENANCE_PROGRAMS should be false")
    if snap["sync_legacy_maintenance_programs"]:
        gaps.append("SYNC_LEGACY_MAINTENANCE_PROGRAMS should be false")
    if not snap["tenant_strict_mode"]:
        gaps.append("TENANT_STRICT_MODE should be true")
    if not snap["reliability_graph_strict"]:
        gaps.append("RELIABILITY_GRAPH_STRICT should be true (or deployed env default)")
    if snap["redis_required"] and not snap["redis_configured"]:
        gaps.append("REDIS_URL required but not configured")
    return gaps
