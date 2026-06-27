"""Run the maintenance scheduler engine (service layer)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from models.maintenance_scheduler import RunSchedulerRequest
from services.maintenance_scheduling import DEFAULT_HORIZON_DAYS, schedule_program

logger = logging.getLogger(__name__)


async def run_scheduler_impl(
    request: RunSchedulerRequest,
    current_user: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Generate scheduled tasks for all active maintenance programs within the horizon.

    Pre-work (cleanup + PM import sync) runs first; program scheduling uses
    concurrent ``schedule_program`` calls to stay within gateway timeouts.
    """
    from services.maintenance_program_service import MaintenanceProgramService
    from services.maintenance_scheduler_sync import cleanup_schedules_without_strategy
    from services.scheduler_program_source import load_schedulable_programs

    strategy_cleanup = await cleanup_schedules_without_strategy(
        equipment_type_id=request.equipment_type_id,
        user=current_user,
    )

    await MaintenanceProgramService.sync_imported_program_tasks_to_scheduler(
        equipment_type_id=request.equipment_type_id,
        schedule=False,
        user=current_user,
    )

    schedulable_programs = await load_schedulable_programs(
        equipment_type_id=request.equipment_type_id,
        user=current_user,
    )

    horizon = request.planning_horizon_days or DEFAULT_HORIZON_DAYS
    if schedulable_programs:
        results = await asyncio.gather(
            *[schedule_program(program, horizon) for program in schedulable_programs]
        )
        tasks_created = [task_id for batch in results for task_id in batch]
    else:
        tasks_created = []

    logger.info(
        "run_scheduler completed type=%s programs=%d tasks_created=%d user=%s",
        request.equipment_type_id,
        len(schedulable_programs),
        len(tasks_created),
        (current_user or {}).get("id"),
    )

    return {
        "message": "Scheduler run completed",
        "tasks_created": len(tasks_created),
        "programs_reviewed": len(schedulable_programs),
        "programs_skipped_no_strategy": 0,
        "strategy_cleanup": strategy_cleanup,
    }
