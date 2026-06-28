"""
Tenant-scoped entity access checks for secure file uploads.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from config.file_upload_config import LinkedEntityType
from database import db
from services.tenant_schema import merge_tenant_filter


# Entity type → Mongo collection, id field, RBAC permissions
_ENTITY_ACCESS: Dict[str, Dict[str, Any]] = {
    LinkedEntityType.OBSERVATION.value: {
        "collection": "observations",
        "read_permission": "observations:read",
        "write_permission": "observations:write",
    },
    LinkedEntityType.INVESTIGATION.value: {
        "collection": "investigations",
        "read_permission": "investigations:read",
        "write_permission": "investigations:write",
    },
    LinkedEntityType.EQUIPMENT.value: {
        "collection": "equipment_nodes",
        "read_permission": "equipment:read",
        "write_permission": "equipment:write",
    },
    LinkedEntityType.ACTION.value: {
        "collection": "central_actions",
        "read_permission": "actions:read",
        "write_permission": "actions:write",
    },
    LinkedEntityType.MAINTENANCE_PROGRAM.value: {
        "collection": "maintenance_programs_v2",
        "read_permission": "library:read",
        "write_permission": "library:write",
    },
    LinkedEntityType.FORM_SUBMISSION.value: {
        "collection": "form_submissions",
        "read_permission": "forms:read",
        "write_permission": "forms:write",
    },
    LinkedEntityType.PM_IMPORT.value: {
        "collection": "pm_import_sessions",
        "read_permission": "library:read",
        "write_permission": "library:write",
    },
    LinkedEntityType.DOCUMENT_LIBRARY.value: {
        "collection": None,
        "read_permission": "library:read",
        "write_permission": "library:write",
    },
}


async def _has_permission(user: dict, permission: str) -> bool:
    role = user.get("role", "viewer")
    if role == "owner":
        return True
    from services.permission_resolver import check_api_permission

    return await check_api_permission(role, permission)


async def assert_entity_access(
    user: dict,
    linked_entity_type: str,
    linked_entity_id: Optional[str],
    *,
    require_write: bool = False,
) -> None:
    """Verify user may attach files to the linked entity."""
    if linked_entity_type not in _ENTITY_ACCESS:
        raise HTTPException(status_code=400, detail=f"Unsupported linked_entity_type: {linked_entity_type}")

    cfg = _ENTITY_ACCESS[linked_entity_type]
    perm = cfg["write_permission"] if require_write else cfg["read_permission"]
    if not await _has_permission(user, perm):
        raise HTTPException(status_code=403, detail=f"Permission denied: {perm}")

    collection_name = cfg["collection"]
    if collection_name is None:
        # document_library — permission-only, no entity lookup
        return

    if not linked_entity_id:
        raise HTTPException(status_code=400, detail="linked_entity_id is required for this entity type")

    collection = db[collection_name]
    doc = await collection.find_one(
        merge_tenant_filter({"id": linked_entity_id}, user),
        {"_id": 0, "id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"{linked_entity_type} not found")


async def assert_file_access(user: dict, file_doc: dict, *, require_write: bool = False) -> None:
    """Verify user can access an uploaded_files record."""
    from services.tenant_schema import tenant_read_filter

    tenant_part = tenant_read_filter(user)
    if tenant_part:
        tid = file_doc.get("tenant_id")
        user_tid = user.get("company_id") or user.get("organization_id")
        if tid and user_tid and tid != user_tid:
            raise HTTPException(status_code=403, detail="Access denied")

    if file_doc.get("uploaded_by") == user.get("id"):
        return

    await assert_entity_access(
        user,
        file_doc.get("linked_entity_type", ""),
        file_doc.get("linked_entity_id"),
        require_write=require_write,
    )
