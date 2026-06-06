"""
Scheduler feature flags for legacy ``maintenance_programs`` dual-write.

Phase 5 default: v2-only path (scheduler reads ``maintenance_programs_v2``).
Set ``SYNC_LEGACY_MAINTENANCE_PROGRAMS=true`` to re-enable legacy flat-row sync
for rollback during UAT validation.
"""
import os


def should_sync_legacy_maintenance_programs() -> bool:
    """Return True when legacy maintenance_programs rows should be written."""
    return os.getenv("SYNC_LEGACY_MAINTENANCE_PROGRAMS", "false").lower() in (
        "1",
        "true",
        "yes",
    )
