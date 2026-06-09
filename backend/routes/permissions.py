"""
Permissions Routes - Manage role-based permissions
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional, List
from datetime import datetime, timezone
import logging

from database import db
from routes.auth import get_current_user
from services.permission_resolver import invalidate_permissions_cache

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_ROLE_LABELS = {
    "owner": "Owner",
    "admin": "Admin",
    "manager": "Manager",
    "reliability_engineer": "Reliability Engineer",
    "maintenance": "Maintenance",
    "operations": "Operations",
    "operator": "Operator",
    "viewer": "Viewer",
}


def format_role_label(role: str) -> str:
    return SYSTEM_ROLE_LABELS.get(role, role.replace("_", " ").title())


# Default permissions for each role
DEFAULT_PERMISSIONS = {
    "owner": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": True},
        "tasks": {"read": True, "write": True, "delete": True},
        "scheduler": {"read": True, "write": True, "delete": True},
        "forms": {"read": True, "write": True, "delete": True},
        "equipment": {"read": True, "write": True, "delete": True},
        "library": {"read": True, "write": True, "delete": True},
        "library_ai_tools": {"read": True, "write": True, "delete": True},
        "reliability_intelligence": {"read": True, "write": True, "delete": True},
        "chat": {"read": True, "write": True, "delete": True},
        "statistics": {"read": True, "write": True, "delete": True},
        "feedback": {"read": True, "write": True, "delete": True},
        "users": {"read": True, "write": True, "delete": True},
        "settings": {"read": True, "write": True, "delete": True},
    },
    "admin": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": True},
        "tasks": {"read": True, "write": True, "delete": True},
        "scheduler": {"read": True, "write": True, "delete": True},
        "forms": {"read": True, "write": True, "delete": True},
        "equipment": {"read": True, "write": True, "delete": False},
        "library": {"read": True, "write": True, "delete": True},
        "library_ai_tools": {"read": True, "write": True, "delete": False},
        "reliability_intelligence": {"read": True, "write": True, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": True},
        "users": {"read": True, "write": True, "delete": False},
        "settings": {"read": True, "write": False, "delete": False},
    },
    "reliability_engineer": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "scheduler": {"read": True, "write": True, "delete": False},
        "forms": {"read": True, "write": True, "delete": False},
        "equipment": {"read": True, "write": True, "delete": False},
        "library": {"read": True, "write": True, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": True, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": True, "write": False, "delete": False},
        "settings": {"read": True, "write": False, "delete": False},
    },
    "maintenance": {
        "observations": {"read": True, "write": True, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "scheduler": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": False, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
    "operations": {
        "observations": {"read": True, "write": True, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "scheduler": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": False, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
    "viewer": {
        "observations": {"read": True, "write": False, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": False, "delete": False},
        "tasks": {"read": True, "write": False, "delete": False},
        "scheduler": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": False, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
}

# Legacy UI role aliases — keep in sync with rbac_service.ROLE_ALIASES
DEFAULT_PERMISSIONS["manager"] = DEFAULT_PERMISSIONS["admin"]
DEFAULT_PERMISSIONS["operator"] = DEFAULT_PERMISSIONS["operations"]

# Feature labels for UI — keep names aligned with nav / page titles in the frontend.
FEATURES = {
    "observations": {
        "name": "Observations",
        "description": "Observations page and threat management"
    },
    "investigations": {
        "name": "Causal Engine",
        "description": "Causal Engine investigations and root-cause analysis"
    },
    "actions": {
        "name": "Actions",
        "description": "Actions page and corrective/preventive work"
    },
    "tasks": {
        "name": "My Tasks",
        "description": "My Tasks execution queue"
    },
    "scheduler": {
        "name": "Execution",
        "description": "Execution planner and task scheduling"
    },
    "forms": {
        "name": "Reports",
        "description": "Reports and form submissions"
    },
    "equipment": {
        "name": "Equipment Manager",
        "description": "Equipment Manager and definitions"
    },
    "library": {
        "name": "Strategy",
        "description": "Strategy library for failure modes and maintenance programs"
    },
    "library_ai_tools": {
        "name": "Strategy — AI Tools",
        "description": "AI tools inside Strategy: suggest failure modes, bulk improve, review disciplines, find similar, suggest equipment types, and the not-improved filter"
    },
    "reliability_intelligence": {
        "name": "Reliability Intelligence",
        "description": "Reliability Intelligence main page and case management"
    },
    "chat": {
        "name": "AI Chat",
        "description": "AI assistant sidebar for reliability questions"
    },
    "statistics": {
        "name": "User Statistics",
        "description": "User Statistics settings page"
    },
    "feedback": {
        "name": "Feedback",
        "description": "Feedback page and suggestions"
    },
    "users": {
        "name": "User Management",
        "description": "User Management settings page"
    },
    "settings": {
        "name": "Settings",
        "description": "Settings pages and system configuration"
    },
}


class FeaturePermissions(BaseModel):
    read: bool = True
    write: bool = False
    delete: bool = False


class RolePermissions(BaseModel):
    role: str
    permissions: Dict[str, FeaturePermissions]


class PermissionsUpdate(BaseModel):
    role: str
    feature: str
    read: Optional[bool] = None
    write: Optional[bool] = None
    delete: Optional[bool] = None


class RoleCreate(BaseModel):
    name: str
    display_name: str
    description: Optional[str] = None
    base_role: Optional[str] = "viewer"  # Copy permissions from this role


class RoleUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None


# Store for custom roles
SYSTEM_ROLES = ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"]


def _backfill_permissions(stored_perms: Dict) -> Dict:
    """Ensure every role in `stored_perms` has an entry for every feature key
    in FEATURES. When a new permission feature is introduced (e.g.
    `library_ai_tools`), older stored docs don't have it — we fall back to the
    role's default permission for that feature, or to `viewer` defaults for
    custom roles. This keeps the UI permission matrix complete and ensures
    `hasPermission` doesn't silently return False for newly-added features.
    """
    if not isinstance(stored_perms, dict):
        return DEFAULT_PERMISSIONS.copy()
    result: Dict = {}
    for role_name, role_perms in stored_perms.items():
        merged = dict(role_perms or {})
        if "insights" in merged and "reliability_intelligence" not in merged:
            merged["reliability_intelligence"] = dict(merged["insights"])
        merged.pop("insights", None)
        defaults_for_role = DEFAULT_PERMISSIONS.get(role_name) or DEFAULT_PERMISSIONS["viewer"]
        for feature_key in FEATURES.keys():
            if feature_key not in merged:
                merged[feature_key] = dict(defaults_for_role.get(feature_key, {"read": False, "write": False, "delete": False}))
        result[role_name] = merged
    return result


@router.get("/permissions/roles")
async def list_roles(current_user: dict = Depends(get_current_user)):
    """List all roles including custom roles."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage roles")
    
    # Get custom roles from database
    custom_roles_doc = await db.permissions.find_one({"type": "custom_roles"})
    custom_roles = custom_roles_doc.get("roles", []) if custom_roles_doc else []
    
    # Build role list with metadata
    roles = []
    for role in SYSTEM_ROLES:
        display_name = format_role_label(role)
        roles.append({
            "name": role,
            "display_name": display_name,
            "description": f"System role: {display_name}",
            "is_system": True,
            "is_deletable": False
        })
    
    for role in custom_roles:
        roles.append({
            "name": role["name"],
            "display_name": role.get("display_name", role["name"]),
            "description": role.get("description", ""),
            "is_system": False,
            "is_deletable": True,
            "created_at": role.get("created_at")
        })
    
    return {"roles": roles}


@router.post("/permissions/roles")
async def create_role(
    role_data: RoleCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new custom role."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create roles")
    
    # Validate role name
    role_name = role_data.name.lower().replace(" ", "_")
    
    if not role_name or len(role_name) < 2:
        raise HTTPException(status_code=400, detail="Role name must be at least 2 characters")
    
    if role_name in SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="Cannot use system role name")
    
    # Check if role already exists
    custom_roles_doc = await db.permissions.find_one({"type": "custom_roles"})
    existing_roles = custom_roles_doc.get("roles", []) if custom_roles_doc else []
    
    if any(r["name"] == role_name for r in existing_roles):
        raise HTTPException(status_code=400, detail=f"Role '{role_name}' already exists")
    
    # Get base role permissions
    base_role = role_data.base_role or "viewer"
    if base_role not in DEFAULT_PERMISSIONS:
        base_role = "viewer"
    
    base_permissions = DEFAULT_PERMISSIONS.get(base_role, DEFAULT_PERMISSIONS["viewer"]).copy()
    
    # Create the new role
    new_role = {
        "name": role_name,
        "display_name": role_data.display_name,
        "description": role_data.description or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    # Add to custom roles list
    await db.permissions.update_one(
        {"type": "custom_roles"},
        {
            "$push": {"roles": new_role},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        upsert=True
    )
    
    # Add permissions for the new role
    stored_perms = await db.permissions.find_one({"type": "role_permissions"})
    if stored_perms:
        current_perms = stored_perms.get("permissions", DEFAULT_PERMISSIONS.copy())
    else:
        current_perms = DEFAULT_PERMISSIONS.copy()
    
    current_perms[role_name] = base_permissions
    
    await db.permissions.update_one(
        {"type": "role_permissions"},
        {
            "$set": {
                "permissions": current_perms,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    invalidate_permissions_cache()
    logger.info(f"Custom role '{role_name}' created by user {current_user['id']}")
    
    return {
        "message": f"Role '{role_data.display_name}' created successfully",
        "role": new_role,
        "permissions": base_permissions
    }


@router.delete("/permissions/roles/{role_name}")
async def delete_role(
    role_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom role."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete roles")
    
    if role_name in SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    
    # Check if role exists
    custom_roles_doc = await db.permissions.find_one({"type": "custom_roles"})
    if not custom_roles_doc:
        raise HTTPException(status_code=404, detail="Role not found")
    
    existing_roles = custom_roles_doc.get("roles", [])
    if not any(r["name"] == role_name for r in existing_roles):
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Check if any users have this role
    users_with_role = await db.users.count_documents({"role": role_name})
    if users_with_role > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete role: {users_with_role} user(s) still have this role"
        )
    
    # Remove from custom roles
    await db.permissions.update_one(
        {"type": "custom_roles"},
        {
            "$pull": {"roles": {"name": role_name}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Remove permissions for this role
    stored_perms = await db.permissions.find_one({"type": "role_permissions"})
    if stored_perms:
        current_perms = stored_perms.get("permissions", {})
        if role_name in current_perms:
            del current_perms[role_name]
            await db.permissions.update_one(
                {"type": "role_permissions"},
                {"$set": {"permissions": current_perms}}
            )
    
    invalidate_permissions_cache()
    logger.info(f"Custom role '{role_name}' deleted by user {current_user['id']}")
    
    return {"message": f"Role '{role_name}' deleted successfully"}


@router.get("/permissions")
async def get_all_permissions(current_user: dict = Depends(get_current_user)):
    """Get permissions configuration for all roles."""
    # Only owner can view/edit permissions
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage permissions")
    
    # Try to get custom permissions from database
    stored_permissions = await db.permissions.find_one({"type": "role_permissions"})
    
    if stored_permissions:
        permissions = _backfill_permissions(stored_permissions.get("permissions", DEFAULT_PERMISSIONS))
    else:
        permissions = DEFAULT_PERMISSIONS.copy()
    
    # Get custom roles
    custom_roles_doc = await db.permissions.find_one({"type": "custom_roles"})
    custom_role_names = [r["name"] for r in custom_roles_doc.get("roles", [])] if custom_roles_doc else []
    
    # All roles = system roles + custom roles
    all_roles = SYSTEM_ROLES + custom_role_names
    
    return {
        "permissions": permissions,
        "features": FEATURES,
        "roles": all_roles,
        "system_roles": SYSTEM_ROLES,
        "custom_roles": custom_role_names
    }


@router.get("/permissions/my")
async def get_my_permissions(current_user: dict = Depends(get_current_user)):
    """Get the current user's permissions based on their role."""
    user_role = current_user.get("role", "viewer")
    
    # Get permissions
    stored = await db.permissions.find_one({"type": "role_permissions"})
    if stored:
        permissions = _backfill_permissions(stored.get("permissions", DEFAULT_PERMISSIONS))
    else:
        permissions = DEFAULT_PERMISSIONS
    
    role_perms = permissions.get(user_role, DEFAULT_PERMISSIONS.get("viewer", {}))
    
    return {
        "role": user_role,
        "permissions": role_perms,
        "features": FEATURES
    }


@router.get("/permissions/check/{feature}")
async def check_permission(
    feature: str,
    action: str = "read",
    current_user: dict = Depends(get_current_user)
):
    """Check if the current user has a specific permission."""
    if feature not in FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")
    
    if action not in ["read", "write", "delete"]:
        raise HTTPException(status_code=400, detail="Action must be 'read', 'write', or 'delete'")
    
    user_role = current_user.get("role", "viewer")
    
    # Get permissions
    stored = await db.permissions.find_one({"type": "role_permissions"})
    if stored:
        permissions = _backfill_permissions(stored.get("permissions", DEFAULT_PERMISSIONS))
    else:
        permissions = DEFAULT_PERMISSIONS
    
    role_perms = permissions.get(user_role, DEFAULT_PERMISSIONS.get("viewer", {}))
    feature_perms = role_perms.get(feature, {"read": False, "write": False, "delete": False})
    
    has_permission = feature_perms.get(action, False)
    
    return {
        "feature": feature,
        "action": action,
        "allowed": has_permission,
        "role": user_role
    }


@router.get("/permissions/{role}")
async def get_role_permissions(
    role: str,
    current_user: dict = Depends(get_current_user)
):
    """Get permissions for a specific role."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage permissions")
    
    stored_permissions = await db.permissions.find_one({"type": "role_permissions"})
    
    if stored_permissions:
        all_perms = _backfill_permissions(stored_permissions.get("permissions", {}))
        permissions = all_perms.get(role)
    else:
        permissions = DEFAULT_PERMISSIONS.get(role)
    
    if not permissions:
        raise HTTPException(status_code=404, detail=f"Role '{role}' not found")
    
    return {"role": role, "permissions": permissions}


@router.put("/permissions/{role}")
async def update_role_permissions(
    role: str,
    permissions: Dict[str, Dict[str, bool]],
    current_user: dict = Depends(get_current_user)
):
    """Update all permissions for a role."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage permissions")
    
    # Don't allow modifying owner permissions
    if role == "owner":
        raise HTTPException(status_code=400, detail="Owner permissions cannot be modified")
    
    valid_roles = ["admin", "reliability_engineer", "maintenance", "operations", "viewer"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")
    
    # Validate feature names
    for feature in permissions.keys():
        if feature not in FEATURES:
            raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")
    
    # Get or create permissions document
    stored = await db.permissions.find_one({"type": "role_permissions"})
    
    if stored:
        current_perms = stored.get("permissions", DEFAULT_PERMISSIONS.copy())
    else:
        current_perms = DEFAULT_PERMISSIONS.copy()
    
    # Update the specific role's permissions
    current_perms[role] = permissions
    
    # Upsert to database
    await db.permissions.update_one(
        {"type": "role_permissions"},
        {
            "$set": {
                "permissions": current_perms,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"]
            }
        },
        upsert=True
    )
    
    invalidate_permissions_cache()
    logger.info(f"Permissions updated for role '{role}' by user {current_user['id']}")
    
    return {"message": f"Permissions updated for role '{role}'", "role": role, "permissions": permissions}


@router.patch("/permissions")
async def patch_permission(
    update: PermissionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a single permission for a role."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage permissions")
    
    if update.role == "owner":
        raise HTTPException(status_code=400, detail="Owner permissions cannot be modified")
    
    if update.feature not in FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {update.feature}")
    
    # Get or create permissions document
    stored = await db.permissions.find_one({"type": "role_permissions"})
    
    if stored:
        current_perms = stored.get("permissions", DEFAULT_PERMISSIONS.copy())
    else:
        current_perms = DEFAULT_PERMISSIONS.copy()
    
    # Ensure role exists in permissions
    if update.role not in current_perms:
        current_perms[update.role] = DEFAULT_PERMISSIONS.get(update.role, {})
    
    # Ensure feature exists for role
    if update.feature not in current_perms[update.role]:
        current_perms[update.role][update.feature] = {"read": True, "write": False, "delete": False}
    
    # Update specific permissions
    if update.read is not None:
        current_perms[update.role][update.feature]["read"] = update.read
    if update.write is not None:
        current_perms[update.role][update.feature]["write"] = update.write
    if update.delete is not None:
        current_perms[update.role][update.feature]["delete"] = update.delete
    
    # Upsert to database
    await db.permissions.update_one(
        {"type": "role_permissions"},
        {
            "$set": {
                "permissions": current_perms,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"]
            }
        },
        upsert=True
    )
    
    invalidate_permissions_cache()
    return {
        "message": "Permission updated",
        "role": update.role,
        "feature": update.feature,
        "permissions": current_perms[update.role][update.feature]
    }


@router.post("/permissions/reset")
async def reset_permissions(current_user: dict = Depends(get_current_user)):
    """Reset all permissions to defaults."""
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage permissions")
    
    await db.permissions.update_one(
        {"type": "role_permissions"},
        {
            "$set": {
                "permissions": DEFAULT_PERMISSIONS,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"],
                "reset": True
            }
        },
        upsert=True
    )
    
    invalidate_permissions_cache()
    logger.info(f"Permissions reset to defaults by user {current_user['id']}")
    
    return {"message": "Permissions reset to defaults", "permissions": DEFAULT_PERMISSIONS}
