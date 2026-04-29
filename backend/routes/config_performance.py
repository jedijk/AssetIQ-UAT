"""
Optional server-driven overrides for client adaptive performance (lite vs full UI).
"""
import os

from fastapi import APIRouter

router = APIRouter(tags=["Config"])


def _env_bool(name: str) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    return v in ("1", "true", "yes", "on")


@router.get("/config/performance")
async def get_performance_config():
    """
    Returns flags merged client-side with device detection.
    Defaults keep full UI unless deployment opts in via env.
    """
    return {
        "forceLiteMode": _env_bool("ASSETIQ_FORCE_LITE_MODE"),
        "disableCharts": _env_bool("ASSETIQ_DISABLE_CHARTS"),
    }
