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

logger = logging.getLogger(__name__)
router = APIRouter()


# Default permissions for each role
DEFAULT_PERMISSIONS = {
    "owner": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": True},
        "tasks": {"read": True, "write": True, "delete": True},
        "forms": {"read": True, "write": True, "delete": True},
        "equipment": {"read": True, "write": True, "delete": True},
        "library": {"read": True, "write": True, "delete": True},
        "feedback": {"read": True, "write": True, "delete": True},
        "users": {"read": True, "write": True, "delete": True},
        "settings": {"read": True, "write": True, "delete": True},
    },
    "admin": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": True},
        "tasks": {"read": True, "write": True, "delete": True},
        "forms": {"read": True, "write": True, "delete": True},
        "equipment": {"read": True, "write": True, "delete": False},
        "library": {"read": True, "write": True, "delete": True},
        "feedback": {"read": True, "write": True, "delete": True},
        "users": {"read": True, "write": True, "delete": False},
        "settings": {"read": True, "write": False, "delete": False},
    },
    "reliability_engineer": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "forms": {"read": True, "write": True, "delete": False},
        "equipment": {"read": True, "write": True, "delete": False},
        "library": {"read": True, "write": True, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": True, "write": False, "delete": False},
        "settings": {"read": True, "write": False, "delete": False},
    },
    "maintenance": {
        "observations": {"read": True, "write": True, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
    "operations": {
        "observations": {"read": True, "write": True, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
    "viewer": {
        "observations": {"read": True, "write": False, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": False, "delete": False},
        "tasks": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
}

# Feature descriptions for UI
FEATURES = {
    "observations": {
        "name": "Observations",
        "description": "Risk observations and threat management"
    },
    "investigations": {
        "name": "Causal Investigations",
        "description": "Root cause analysis and causal trees"
    },
    "actions": {
        "name": "Actions",
        "description": "Corrective and preventive actions"
    },
    "tasks": {
        "name": "My Tasks",
        "description": "Task execution and scheduling"
    },
    "forms": {
        "name": "Form Designer",
        "description": "Form templates and submissions"
    },
    "equipment": {
        "name": "Equipment Manager",
        "description": "Equipment hierarchy and criticality"
    },
    "library": {
        "name": "Library",
        "description": "Failure modes and maintenance strategies"
    },
    "feedback": {
        "name": "Feedback",
        "description": "User feedback and suggestions"
    },
    "users": {
        "name": "User Management",
        "description": "User accounts and access control"
    },
    "settings": {
        "name": "Settings",
        "description": "System configuration and permissions"
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


@router.get("/permissions")
async def get_all_permissions(current_user: dict = Depends(get_current_user)):
    """Get permissions configuration for all roles."""
    # Only owner can view/edit permissions
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can manage permissions")
    
    # Try to get custom permissions from database
    stored_permissions = await db.permissions.find_one({"type": "role_permissions"})
    
    if stored_permissions:
        permissions = stored_permissions.get("permissions", DEFAULT_PERMISSIONS)
    else:
        permissions = DEFAULT_PERMISSIONS.copy()
    
    return {
        "permissions": permissions,
        "features": FEATURES,
        "roles": ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"]
    }


@router.get("/permissions/my")
async def get_my_permissions(current_user: dict = Depends(get_current_user)):
    """Get the current user's permissions based on their role."""
    user_role = current_user.get("role", "viewer")
    
    # Get permissions
    stored = await db.permissions.find_one({"type": "role_permissions"})
    if stored:
        permissions = stored.get("permissions", DEFAULT_PERMISSIONS)
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
        permissions = stored.get("permissions", DEFAULT_PERMISSIONS)
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
        permissions = stored_permissions.get("permissions", {}).get(role)
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
    
    logger.info(f"Permissions reset to defaults by user {current_user['id']}")
    
    return {"message": "Permissions reset to defaults", "permissions": DEFAULT_PERMISSIONS}
