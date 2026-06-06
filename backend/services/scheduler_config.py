"""
Scheduler feature flags for legacy ``maintenance_programs`` dual-write.

Phase 5 default: v2-only path (scheduler reads ``maintenance_programs_v2``).
Set ``SYNC_LEGACY_MAINTENANCE_PROGRAMS=true`` to re-enable legacy flat-row sync
for rollback during UAT validation.
"""
import os


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in ("1", "true", "yes")


def should_sync_legacy_maintenance_programs() -> bool:
    """Return True when legacy maintenance_programs rows should be written."""
    return _env_flag("SYNC_LEGACY_MAINTENANCE_PROGRAMS", "false")


def should_read_legacy_maintenance_programs() -> bool:
    """Return True when scheduler/API may fall back to legacy flat program rows."""
    return _env_flag("READ_LEGACY_MAINTENANCE_PROGRAMS", "false")
