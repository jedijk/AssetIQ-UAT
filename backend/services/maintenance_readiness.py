"""
Read-only maintenance domain metrics for UAT / prod cutover checks.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict

from database import db
from services.maintenance_tenant_scope import maintenance_scoped_job
from services.background_jobs import background_job_service
from services.scheduler_config import (
    should_read_legacy_maintenance_programs,
    should_sync_legacy_maintenance_programs,
)
from services.worker_config import use_external_background_worker

UAT_GATES_SCRIPT = "backend/scripts/verify_uat_gates.py"


async def _count_maintenance_domain() -> Dict[str, int]:
    (
        strategy_needs_apply_count,
        active_strategies,
        v2_program_count,
        legacy_program_count,
        reliability_edges_total,
    ) = await asyncio.gather(
        db.equipment_type_strategies.count_documents(
            maintenance_scoped_job({"strategy_needs_apply": True})
        ),
        db.equipment_type_strategies.count_documents(
            maintenance_scoped_job({"status": "active"})
        ),
        db.maintenance_programs_v2.count_documents(maintenance_scoped_job({})),
        db.maintenance_programs.count_documents(maintenance_scoped_job({})),
        db.reliability_edges.count_documents(maintenance_scoped_job({})),
    )

    return {
        "strategy_needs_apply_count": strategy_needs_apply_count,
        "active_strategies": active_strategies,
        "v2_program_count": v2_program_count,
        "legacy_program_count": legacy_program_count,
        "reliability_edges_total": reliability_edges_total,
    }


async def build_maintenance_readiness_snapshot() -> Dict[str, Any]:
    """Assemble the admin maintenance-readiness payload (no subprocess calls)."""
    counts = await _count_maintenance_domain()
    queue_health = await background_job_service.get_queue_health()

    return {
        "read_legacy_maintenance_programs": should_read_legacy_maintenance_programs(),
        "sync_legacy_maintenance_programs": should_sync_legacy_maintenance_programs(),
        "use_external_background_worker": use_external_background_worker(),
        **counts,
        "background_jobs": queue_health,
        "uat_gates_script": UAT_GATES_SCRIPT,
    }
