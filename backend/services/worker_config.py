"""
Background worker deployment flags.
"""
import os


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in ("1", "true", "yes")


def use_external_background_worker() -> bool:
    """When true, API enqueues jobs to MongoDB only; run_background_worker.py executes them."""
    return _env_flag("USE_EXTERNAL_BACKGROUND_WORKER", "false")
