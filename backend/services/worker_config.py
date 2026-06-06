"""
Background worker deployment flags.
"""
import os
from typing import Optional


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in ("1", "true", "yes")


def use_external_background_worker() -> bool:
    """When true, API enqueues jobs to MongoDB only; run_background_worker.py executes them."""
    if "USE_EXTERNAL_BACKGROUND_WORKER" in os.environ:
        return _env_flag("USE_EXTERNAL_BACKGROUND_WORKER", "false")
    env = (
        os.getenv("RAILWAY_ENVIRONMENT")
        or os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or ""
    ).lower()
    if env in ("production", "prod", "uat", "staging"):
        return True
    return False


def worker_tenant_id() -> Optional[str]:
    """When set, external worker only claims jobs for this tenant (company_id / organization_id)."""
    val = os.getenv("WORKER_TENANT_ID", "").strip()
    return val or None
