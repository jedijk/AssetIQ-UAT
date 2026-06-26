"""Maintenance program routes — service layer facade."""

from services.maintenance_program_routes_crud import (
    create_maintenance_program,
    delete_maintenance_program,
    get_maintenance_program,
    get_programs_summary,
    list_maintenance_programs,
)
from services.maintenance_program_routes_operations import (
    accept_ai_recommendation,
    generate_ai_recommendations,
    import_tasks,
    regenerate_program,
)
from services.maintenance_program_routes_status import (
    approve_program,
    bulk_generate_programs,
    bulk_regenerate_programs,
    get_audit_log,
    get_version_history,
    update_program_status,
)
from services.maintenance_program_routes_tasks import (
    add_task,
    delete_task,
    get_program_tasks,
    update_task,
)

__all__ = [
    "accept_ai_recommendation",
    "add_task",
    "approve_program",
    "bulk_generate_programs",
    "bulk_regenerate_programs",
    "create_maintenance_program",
    "delete_maintenance_program",
    "delete_task",
    "generate_ai_recommendations",
    "get_audit_log",
    "get_maintenance_program",
    "get_program_tasks",
    "get_programs_summary",
    "get_version_history",
    "import_tasks",
    "list_maintenance_programs",
    "regenerate_program",
    "update_program_status",
    "update_task",
]
