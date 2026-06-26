"""Import PM Import session tasks into a maintenance program."""
from datetime import datetime
from typing import List, Optional, Tuple

from database import db
from models.maintenance_program import TaskCategory, TaskFrequency, TaskSource, TaskTraceability


async def import_tasks_from_session(
    equipment_id: str,
    import_session_id: str,
    task_ids: Optional[List[str]] = None,
    user_id: Optional[str] = None,
) -> Tuple[int, str]:
    """Import tasks from a PM Import session. Returns (tasks_imported, new_version)."""
    from services.maintenance_program_service import MaintenanceProgramService

    session = await db.pm_import_sessions.find_one(
        {"session_id": import_session_id},
        {"_id": 0},
    )

    if not session:
        raise ValueError(f"Import session not found: {import_session_id}")

    extracted_tasks = session.get("tasks_extracted") or session.get("extracted_tasks") or []
    tasks_to_import = []

    for task in extracted_tasks:
        review_status = task.get("review_status", "pending")
        if review_status != "accepted":
            continue

        if task_ids and task.get("id") not in task_ids:
            continue

        tasks_to_import.append(task)

    if not tasks_to_import:
        return 0, ""

    imported_count = 0
    new_version = None

    for imported_task in tasks_to_import:
        frequency_str = imported_task.get("frequency", "monthly").lower()
        try:
            frequency = TaskFrequency(frequency_str)
        except ValueError:
            frequency = TaskFrequency.MONTHLY

        task_type = imported_task.get("task_type", "preventive").lower()
        category = MaintenanceProgramService.TASK_TYPE_TO_CATEGORY.get(
            task_type,
            TaskCategory.PREVENTIVE_MAINTENANCE,
        )

        pm_task_id = imported_task.get("task_id") or imported_task.get("id")
        traceability = TaskTraceability(
            import_session_id=import_session_id,
            import_source_file=session.get("file_name"),
            import_row_reference=str(imported_task.get("row_index", "") or pm_task_id or ""),
            failure_mode_id=imported_task.get("matched_failure_mode_id"),
            failure_mode_name=imported_task.get("matched_failure_mode_name"),
        )

        _, version = await MaintenanceProgramService.add_task(
            equipment_id=equipment_id,
            task_title=imported_task.get("task_name", "Imported Task"),
            task_description=imported_task.get("description"),
            frequency=frequency,
            estimated_duration_hours=imported_task.get("estimated_duration", 1.0),
            task_category=category,
            task_source=TaskSource.CUSTOMER_IMPORTED,
            procedure_steps=imported_task.get("procedure_steps", []),
            acceptance_criteria=imported_task.get("acceptance_criteria", []),
            traceability=traceability,
            user_id=user_id,
        )
        new_version = version
        imported_count += 1

    await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "last_import_session_id": import_session_id,
                "last_import_date": datetime.utcnow().isoformat(),
            }
        },
    )

    return imported_count, new_version or ""
