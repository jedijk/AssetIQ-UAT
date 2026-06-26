"""Maintenance program routes — status, approval, audit, and bulk operations."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import HTTPException

from database import db
from models.maintenance_program import ApprovalRequest, ApprovalStatus, ProgramStatus
from services.maintenance_program_routes_helpers import current_user_id
from services.maintenance_program_service import MaintenanceProgramService
from services.maintenance_tenant_scope import maintenance_scoped


async def update_program_status(
    equipment_id: str,
    status: ProgramStatus, current_user: dict,
):
    """Update the status of a maintenance program."""
    result = await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "status": status.value,
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance program not found")

    return {
        "message": f"Program status updated to {status.value}",
        "status": status.value
    }


async def approve_program(
    equipment_id: str,
    request: ApprovalRequest, current_user: dict,
):
    """Approve or reject a maintenance program."""
    update_data = {
        "approval_status": request.approval_status.value,
        "updated_at": datetime.utcnow().isoformat()
    }

    if request.approval_status == ApprovalStatus.APPROVED:
        update_data["approved_by"] = current_user.get("user_id")
        update_data["approved_at"] = datetime.utcnow().isoformat()
        update_data["status"] = ProgramStatus.ACTIVE.value

    result = await db.maintenance_programs_v2.update_one(
        {"equipment_id": equipment_id},
        {"$set": update_data}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance program not found")

    await MaintenanceProgramService._log_audit(
        action=f"program_{request.approval_status.value}",
        equipment_id=equipment_id,
        user_id=current_user_id(current_user),
        details={"comments": request.comments}
    )

    return {
        "message": f"Program {request.approval_status.value}",
        "approval_status": request.approval_status.value
    }


async def get_version_history(
    equipment_id: str, current_user: dict
):
    """Get version history for a maintenance program."""
    program = await db.maintenance_programs_v2.find_one(
        maintenance_scoped(current_user, {"equipment_id": equipment_id}),
        {"_id": 0, "version": 1, "version_history": 1}
    )

    if not program:
        raise HTTPException(status_code=404, detail="Maintenance program not found")

    return {
        "current_version": program.get("version", "1.0"),
        "version_history": program.get("version_history", [])
    }


async def get_audit_log(
    equipment_id: str,
    limit: int = 50, *, current_user: dict
):
    """Get audit log for a maintenance program."""
    audit_entries = await db.maintenance_program_audit.find(
        maintenance_scoped(current_user, {"equipment_id": equipment_id}),
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)

    return {
        "audit_log": audit_entries,
        "total": len(audit_entries)
    }


async def bulk_generate_programs(
    equipment_ids: List[str],
    generate_from_strategy: bool = True, *, current_user: dict,
):
    """Generate maintenance programs for multiple equipment items."""
    results = {
        "created": [],
        "already_exists": [],
        "errors": []
    }

    for equipment_id in equipment_ids:
        try:
            existing = await db.maintenance_programs_v2.find_one(
                maintenance_scoped(current_user, {"equipment_id": equipment_id})
            )
            if existing:
                results["already_exists"].append(equipment_id)
                continue

            program = await MaintenanceProgramService.get_or_create_program(
                equipment_id=equipment_id,
                generate_from_strategy=generate_from_strategy,
                user_id=current_user_id(current_user)
            )
            results["created"].append({
                "equipment_id": equipment_id,
                "program_id": program.id,
                "tasks_count": len(program.tasks)
            })

        except Exception as e:
            results["errors"].append({
                "equipment_id": equipment_id,
                "error": str(e)
            })

    return {
        "message": f"Processed {len(equipment_ids)} equipment items",
        "results": results
    }


async def bulk_regenerate_programs(
    equipment_type_id: str,
    preserve_overrides: bool = True,
    preserve_manual_tasks: bool = True, *, current_user: dict,
):
    """Regenerate all maintenance programs for an equipment type."""
    programs = await db.maintenance_programs_v2.find(
        maintenance_scoped(current_user, {"equipment_type_id": equipment_type_id}),
        {"equipment_id": 1, "_id": 0}
    ).to_list(500)

    results = {
        "regenerated": [],
        "errors": []
    }

    for prog in programs:
        try:
            equipment_id = prog["equipment_id"]
            _, preview = await MaintenanceProgramService.regenerate_program(
                equipment_id=equipment_id,
                preserve_overrides=preserve_overrides,
                preserve_manual_tasks=preserve_manual_tasks,
                user_id=current_user_id(current_user)
            )
            results["regenerated"].append({
                "equipment_id": equipment_id,
                "tasks_added": len(preview.tasks_to_add),
                "tasks_removed": len(preview.tasks_to_remove)
            })
        except Exception as e:
            results["errors"].append({
                "equipment_id": prog.get("equipment_id"),
                "error": str(e)
            })

    return {
        "message": f"Regenerated {len(results['regenerated'])} programs",
        "results": results
    }
