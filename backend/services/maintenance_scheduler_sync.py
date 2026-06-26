"""
Sync maintenance strategy / program changes to the scheduler (scheduled_tasks)
so equipment-type and all-equipment schedule views stay current.

Phase 5: canonical programs live in ``maintenance_programs_v2``. Legacy flat-row
sync to ``maintenance_programs`` is off by default; set
``SYNC_LEGACY_MAINTENANCE_PROGRAMS=true`` to re-enable dual-write.
"""
from services.maintenance_scheduler_cleanup import (
    cleanup_scheduled_tasks_without_active_programs,
    cleanup_schedules_without_strategy,
    cleanup_stale_strategy_schedules,
    clear_equipment_schedule_after_program_delete,
    clear_equipment_type_schedule_after_strategy_delete,
)
from services.maintenance_scheduler_refresh import (
    filter_schedulable_programs,
    propagate_strategy_schedule_updates,
    refresh_equipment_schedule,
    refresh_equipment_type_schedules,
)
from services.maintenance_scheduler_shared import (
    OPEN_TASK_STATUSES,
    invalidate_active_strategy_type_cache,
)
from services.maintenance_scheduler_strategy_sync import sync_strategy_programs_for_equipment
from services.maintenance_scheduler_v2_sync import (
    _cancel_open_scheduled_for_v2_task,
    refresh_schedule_after_v2_task_active_toggle,
    sync_v2_program_tasks_to_scheduler,
)

__all__ = [
    "OPEN_TASK_STATUSES",
    "cleanup_scheduled_tasks_without_active_programs",
    "cleanup_schedules_without_strategy",
    "cleanup_stale_strategy_schedules",
    "clear_equipment_schedule_after_program_delete",
    "clear_equipment_type_schedule_after_strategy_delete",
    "filter_schedulable_programs",
    "invalidate_active_strategy_type_cache",
    "propagate_strategy_schedule_updates",
    "refresh_equipment_schedule",
    "refresh_equipment_type_schedules",
    "refresh_schedule_after_v2_task_active_toggle",
    "sync_strategy_programs_for_equipment",
    "sync_v2_program_tasks_to_scheduler",
    "_cancel_open_scheduled_for_v2_task",
]
