"""
User profile and avatar routes.
Handles user profile photos using object storage.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header, Response
from datetime import datetime, timezone
import logging
from database import db, rbac_service
from auth import get_current_user
from services.storage_service import upload_avatar, get_object, get_mime_type

logger = logging.getLogger(__name__)
router = APIRouter(tags=["User Profile"])


# Maximum file size for avatars (5MB)
MAX_AVATAR_SIZE = 5 * 1024 * 1024

# Allowed image types
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


@router.post("/users/me/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a profile photo for the current user.
    Supports JPEG, PNG, GIF, and WebP images up to 5MB.
    """
    # Validate file type
    content_type = file.content_type or get_mime_type(file.filename)
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP"
        )
    
    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size: 5MB"
        )
    
    try:
        # Upload to object storage
        storage_path = upload_avatar(
            user_id=current_user["id"],
            file_data=content,
            filename=file.filename,
            content_type=content_type
        )
        
        # Update user document with avatar path
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {
                "avatar_path": storage_path,
                "avatar_updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Avatar uploaded for user {current_user['id']}: {storage_path}")
        
        return {
            "message": "Avatar uploaded successfully",
            "avatar_path": storage_path
        }
    
    except Exception as e:
        logger.error(f"Failed to upload avatar: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload avatar")


@router.get("/users/me/avatar")
async def get_my_avatar(
    current_user: dict = Depends(get_current_user)
):
    """Get current user's avatar info."""
    user = await db.users.find_one(
        {"id": current_user["id"]},
        {"_id": 0, "avatar_path": 1, "avatar_updated_at": 1, "name": 1}
    )
    
    if not user or not user.get("avatar_path"):
        return {
            "has_avatar": False,
            "avatar_path": None,
            "initials": user.get("name", "U")[0].upper() if user else "U"
        }
    
    return {
        "has_avatar": True,
        "avatar_path": user["avatar_path"],
        "avatar_updated_at": user.get("avatar_updated_at"),
        "initials": user.get("name", "U")[0].upper()
    }


@router.delete("/users/me/avatar")
async def delete_my_avatar(
    current_user: dict = Depends(get_current_user)
):
    """Remove current user's avatar (soft delete - just removes the reference)."""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"avatar_path": "", "avatar_updated_at": ""}}
    )
    
    return {"message": "Avatar removed"}


@router.get("/users/{user_id}/avatar")
async def get_user_avatar(
    user_id: str,
    authorization: str = Header(None),
    auth: str = Query(None)
):
    """
    Get a user's avatar image.
    Supports both header-based and query param auth for img src compatibility.
    """
    # Simple auth check - accept either header or query param
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get user
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "avatar_path": 1}
    )
    
    if not user or not user.get("avatar_path"):
        raise HTTPException(status_code=404, detail="Avatar not found")
    
    try:
        # Fetch from object storage
        content, content_type = get_object(user["avatar_path"])
        return Response(content=content, media_type=content_type)
    except Exception as e:
        logger.error(f"Failed to get avatar: {e}")
        raise HTTPException(status_code=404, detail="Avatar not found")


# ============= RBAC USER MANAGEMENT WITH AVATAR =============

@router.get("/rbac/users")
async def get_users(
    search: str = Query(None),
    role: str = Query(None),
    is_active: bool = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get all users with optional filtering. Includes avatar info."""
    result = await rbac_service.get_users(
        search=search,
        role=role,
        is_active=is_active
    )
    
    # Enrich with avatar paths
    for user in result.get("users", []):
        user_doc = await db.users.find_one(
            {"id": user["id"]},
            {"_id": 0, "avatar_path": 1}
        )
        user["avatar_path"] = user_doc.get("avatar_path") if user_doc else None
    
    return result


@router.get("/rbac/roles")
async def get_roles(current_user: dict = Depends(get_current_user)):
    """Get all available roles."""
    return {"roles": rbac_service.get_roles()}


@router.patch("/rbac/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a user's role."""
    result = await rbac_service.update_user_role(
        user_id=user_id,
        new_role=role_data.get("role"),
        updated_by=current_user["id"]
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.patch("/rbac/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    status_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Activate or deactivate a user."""
    result = await rbac_service.update_user_status(
        user_id=user_id,
        is_active=status_data.get("is_active", True),
        updated_by=current_user["id"]
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.get("/rbac/users/pending")
async def get_pending_users(
    current_user: dict = Depends(get_current_user)
):
    """Get all users with pending approval status. Admin/Owner only."""
    if current_user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    pending_users = await db.users.find(
        {"approval_status": "pending"},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    return {"users": pending_users, "count": len(pending_users)}


@router.patch("/rbac/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    approval_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a pending user. Admin/Owner only."""
    if current_user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    action = approval_data.get("action")  # "approve" or "reject"
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'")
    
    # Find the user
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("approval_status") != "pending":
        raise HTTPException(status_code=400, detail="User is not pending approval")
    
    # Update user status
    new_status = "approved" if action == "approve" else "rejected"
    rejection_reason = approval_data.get("rejection_reason", "")
    
    update_data = {
        "approval_status": new_status,
        "approved_by": current_user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if action == "reject" and rejection_reason:
        update_data["rejection_reason"] = rejection_reason
    
    # If approving, also set the role if provided
    if action == "approve" and approval_data.get("role"):
        update_data["role"] = approval_data["role"]
    
    # Handle assigned installations
    if action == "approve" and "assigned_installations" in approval_data:
        update_data["assigned_installations"] = approval_data["assigned_installations"]
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    # Send email notification to user
    try:
        from routes.auth import send_approval_result_email
        await send_approval_result_email(
            user_email=user["email"],
            user_name=user.get("name", "User"),
            approved=(action == "approve"),
            rejection_reason=rejection_reason if action == "reject" else None
        )
    except Exception as e:
        logger.error(f"Failed to send approval notification: {e}")
    
    # Fetch and return updated user
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user


@router.patch("/rbac/users/{user_id}/profile")
async def update_user_profile(
    user_id: str,
    profile_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update user profile (name, department, position, phone)."""
    result = await rbac_service.update_user_profile(
        user_id=user_id,
        data=profile_data
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.patch("/rbac/users/{user_id}/installations")
async def update_user_installations(
    user_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update user's assigned installations. Admin/Owner only."""
    if current_user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    assigned_installations = data.get("assigned_installations", [])
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"assigned_installations": assigned_installations}}
    )
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user


@router.post("/rbac/users/{user_id}/avatar")
async def upload_user_avatar_admin(
    user_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Admin endpoint to upload avatar for any user.
    """
    # TODO: Add admin permission check
    
    # Validate file type
    content_type = file.content_type or get_mime_type(file.filename)
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP"
        )
    
    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size: 5MB"
        )
    
    try:
        # Upload to object storage
        storage_path = upload_avatar(
            user_id=user_id,
            file_data=content,
            filename=file.filename,
            content_type=content_type
        )
        
        # Update user document with avatar path
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "avatar_path": storage_path,
                "avatar_updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Avatar uploaded for user {user_id} by admin {current_user['id']}")
        
        return {
            "message": "Avatar uploaded successfully",
            "avatar_path": storage_path
        }
    
    except Exception as e:
        logger.error(f"Failed to upload avatar: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload avatar")



@router.delete("/rbac/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a user permanently.
    - Cannot delete yourself
    - Removes user from database
    """
    # Prevent self-deletion
    if user_id == current_user["id"]:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account"
        )
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete the user
    result = await db.users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Failed to delete user")
    
    logger.info(f"User {user_id} ({user.get('email')}) deleted by {current_user['id']}")
    
    return {
        "message": "User deleted successfully",
        "deleted_user_id": user_id,
        "deleted_user_name": user.get("name")
    }


@router.get("/rbac/role-distribution")
async def get_role_distribution(current_user: dict = Depends(get_current_user)):
    """Get count of users per role."""
    return await rbac_service.get_role_distribution()
