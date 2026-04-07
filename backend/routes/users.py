"""
User profile and avatar routes.
Handles user profile photos using object storage or MongoDB fallback.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header, Response
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
import logging
import uuid
import base64
import os
from database import db, rbac_service
from auth import get_current_user, hash_password
from services.storage_service import upload_avatar, get_object, get_mime_type, is_storage_available
from services.cache_service import CacheService as cache

# Try to import resend for email
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter(tags=["User Profile"])

# Email configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
EMAIL_FRONTEND_URL = os.environ.get("EMAIL_FRONTEND_URL", os.environ.get("FRONTEND_URL", "http://localhost:3000"))

# Initialize Resend if available
if RESEND_AVAILABLE and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Maximum file size for avatars (5MB)
MAX_AVATAR_SIZE = 5 * 1024 * 1024

# Allowed image types
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

# Available roles for user creation
AVAILABLE_ROLES = ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"]

# Role display names (must match RBAC service roles)
ROLE_NAMES = {
    "owner": "Owner",
    "admin": "Admin",
    "reliability_engineer": "Reliability Engineer",
    "maintenance": "Maintenance",
    "operations": "Operations",
    "viewer": "Viewer"
}


class AdminCreateUser(BaseModel):
    """Schema for admin creating a new user."""
    email: EmailStr
    name: str
    password: str
    role: str = "viewer"
    position: str = ""
    phone: str = ""
    location: str = ""
    plant_unit: str = ""
    send_email: bool = True
    installations: list = []


class UserProfileUpdate(BaseModel):
    """Schema for user updating their own profile."""
    name: str = None
    position: str = None
    phone: str = None
    location: str = None


async def send_welcome_email(user_email: str, user_name: str, password: str, role: str):
    """Send welcome email to newly created user with login credentials."""
    if not RESEND_AVAILABLE or not RESEND_API_KEY:
        logger.warning("Resend not configured. Welcome email not sent.")
        return False
    
    login_link = f"{EMAIL_FRONTEND_URL}/login"
    role_name = ROLE_NAMES.get(role, role.title())
    mobile_guide_image = "https://customer-assets.emergentagent.com/job_6a729e6c-f1da-4ef5-9bc4-3f27b6dedd78/artifacts/lzzxzaqo_AssetIQ%20-%20Mobile%20.png"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <tr>
                <td>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <tr>
                            <td style="padding: 40px;">
                                <!-- Logo -->
                                <div style="text-align: center; margin-bottom: 32px;">
                                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1e40af;">AssetIQ</h1>
                                    <p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">Asset Management Intelligence Platform</p>
                                </div>
                                
                                <!-- Welcome Message -->
                                <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1e293b;">Welcome to AssetIQ, {user_name}!</h2>
                                
                                <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #475569;">
                                    Your account has been created and you can now access the Asset Management Intelligence Platform. Here are your login credentials:
                                </p>
                                
                                <!-- Credentials Box -->
                                <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding: 8px 0;">
                                                <span style="color: #64748b; font-size: 14px;">Email:</span><br>
                                                <span style="color: #1e293b; font-size: 16px; font-weight: 600;">{user_email}</span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0;">
                                                <span style="color: #64748b; font-size: 14px;">Temporary Password:</span><br>
                                                <span style="color: #1e293b; font-size: 16px; font-weight: 600; font-family: monospace; background: #e2e8f0; padding: 4px 8px; border-radius: 4px;">{password}</span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0;">
                                                <span style="color: #64748b; font-size: 14px;">Role:</span><br>
                                                <span style="color: #1e293b; font-size: 16px; font-weight: 600;">{role_name}</span>
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Important Notice -->
                                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                                    <p style="margin: 0; font-size: 14px; color: #92400e;">
                                        <strong>Important:</strong> You will be required to change your password when you first log in.
                                    </p>
                                </div>
                                
                                <!-- Login Button -->
                                <div style="text-align: center; margin-bottom: 32px;">
                                    <a href="{login_link}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
                                        Login to AssetIQ
                                    </a>
                                </div>
                                
                                <p style="margin: 0 0 32px; font-size: 14px; color: #64748b; text-align: center;">
                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                    <a href="{login_link}" style="color: #2563eb;">{login_link}</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Mobile App Installation Guide -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); margin-top: 24px;">
                        <tr>
                            <td style="padding: 32px;">
                                <h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1e293b; text-align: center;">
                                    Add AssetIQ to Your Home Screen
                                </h3>
                                <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569; text-align: center;">
                                    Get faster access and work like a native app on your mobile device. Follow the instructions below for Android or iOS.
                                </p>
                                <div style="text-align: center;">
                                    <img src="{mobile_guide_image}" alt="Add AssetIQ to Home Screen - Installation Guide for Android and iOS" style="max-width: 100%; height: auto; border-radius: 8px;" />
                                </div>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Footer -->
                    <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
                        This is an automated message from AssetIQ - Asset Management Intelligence Platform.<br>
                        If you did not expect this email, please contact your administrator.
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    try:
        resend.Emails.send({
            "from": SENDER_EMAIL,
            "to": user_email,
            "subject": "Welcome to AssetIQ - Asset Management Intelligence Platform",
            "html": html_content
        })
        logger.info(f"Welcome email sent to {user_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email to {user_email}: {e}")
        return False


@router.post("/users/create")
async def admin_create_user(
    user_data: AdminCreateUser,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new user (owner only).
    The user is automatically approved and can login immediately.
    Optionally sends a welcome email with login credentials.
    """
    # Check if current user has permission to create users - only owners can create users
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create new users")
    
    # Validate role
    if user_data.role not in AVAILABLE_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(AVAILABLE_ROLES)}")
    
    # Only owners can create other owners or admins
    if user_data.role in ["owner", "admin"] and current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create admin or owner accounts")
    
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password_hash": hash_password(user_data.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approval_status": "approved",  # Admin-created users are auto-approved
        "role": user_data.role,
        "is_active": True,
        "position": user_data.position,
        "phone": user_data.phone,
        "location": user_data.location,
        "plant_unit": user_data.plant_unit,
        "created_by": current_user["id"],
        "must_change_password": True,  # Require password change on first login
        "assigned_installations": user_data.installations,  # Assign to installations
        "has_seen_intro": True,  # Don't show intro until after password change
    }
    await db.users.insert_one(user_doc)
    
    logger.info(f"User created by admin {current_user['email']}: {user_data.email} with role {user_data.role}, installations: {user_data.installations}")
    
    # Send welcome email if requested
    email_sent = False
    if user_data.send_email:
        email_sent = await send_welcome_email(
            user_email=user_data.email,
            user_name=user_data.name,
            password=user_data.password,
            role=user_data.role
        )
    
    return {
        "message": "User created successfully",
        "email_sent": email_sent,
        "user": {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "role": user_data.role,
            "approval_status": "approved",
            "assigned_installations": user_data.installations,
        }
    }


@router.patch("/users/me/profile")
async def update_own_profile(
    profile_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update the current user's own profile information.
    Users can update their name, position, phone, and location.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found")
    
    # Build update document with only provided fields
    update_fields = {}
    if profile_data.name is not None:
        update_fields["name"] = profile_data.name
    if profile_data.position is not None:
        update_fields["position"] = profile_data.position
    if profile_data.phone is not None:
        update_fields["phone"] = profile_data.phone
    if profile_data.location is not None:
        update_fields["location"] = profile_data.location
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Add updated timestamp
    update_fields["updated_at"] = datetime.now(timezone.utc)
    
    try:
        # Update user in database
        result = await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Invalidate cache
        cache.invalidate_user(user_id)
        
        # Fetch updated user
        updated_user = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "password_hash": 0}
        )
        
        return {
            "success": True,
            "message": "Profile updated successfully",
            "user": updated_user
        }
    except Exception as e:
        logger.error(f"Failed to update profile for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.post("/users/me/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a profile photo for the current user.
    Supports JPEG, PNG, GIF, and WebP images up to 5MB.
    Uses object storage if available, otherwise stores in MongoDB.
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
        if is_storage_available():
            # Upload to object storage (Emergent)
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
                    "avatar_storage": "object",
                    "avatar_updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$unset": {"avatar_data": ""}}  # Remove any old MongoDB data
            )
            
            # Invalidate user cache so new avatar is reflected immediately
            cache.invalidate_user(current_user["id"])
            
            logger.info(f"Avatar uploaded to object storage for user {current_user['id']}: {storage_path}")
        else:
            # Fallback: Store in MongoDB as base64
            avatar_data = base64.b64encode(content).decode('utf-8')
            
            await db.users.update_one(
                {"id": current_user["id"]},
                {"$set": {
                    "avatar_data": avatar_data,
                    "avatar_content_type": content_type,
                    "avatar_storage": "mongodb",
                    "avatar_updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$unset": {"avatar_path": ""}}  # Remove any old object storage path
            )
            
            logger.info(f"Avatar stored in MongoDB for user {current_user['id']}")
        
        # Invalidate user cache so new avatar is reflected immediately
        cache.invalidate_user(current_user["id"])
        
        return {
            "message": "Avatar uploaded successfully"
        }
    
    except Exception as e:
        logger.error(f"Failed to upload avatar: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")


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
    Handles both object storage and MongoDB-stored avatars.
    """
    # Simple auth check - accept either header or query param
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Get user with all avatar fields
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "avatar_path": 1, "avatar_data": 1, "avatar_content_type": 1, "avatar_storage": 1}
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check storage type
    storage_type = user.get("avatar_storage", "object")
    
    if storage_type == "mongodb" and user.get("avatar_data"):
        # Return from MongoDB
        try:
            content = base64.b64decode(user["avatar_data"])
            content_type = user.get("avatar_content_type", "image/png")
            return Response(content=content, media_type=content_type)
        except Exception as e:
            logger.error(f"Failed to decode MongoDB avatar: {e}")
            raise HTTPException(status_code=404, detail="Avatar not found")
    
    elif user.get("avatar_path"):
        # Return from object storage
        try:
            content, content_type = get_object(user["avatar_path"])
            return Response(content=content, media_type=content_type)
        except Exception as e:
            logger.error(f"Failed to get avatar from storage: {e}")
            raise HTTPException(status_code=404, detail="Avatar not found")
    
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
    Uses object storage if available, otherwise stores in MongoDB.
    """
    # Admin/Owner permission check
    if current_user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
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
        if is_storage_available():
            # Upload to object storage (Emergent)
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
                    "avatar_storage": "object",
                    "avatar_updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$unset": {"avatar_data": ""}}
            )
            
            # Invalidate user cache so new avatar is reflected immediately
            cache.invalidate_user(user_id)
            
            logger.info(f"Avatar uploaded to object storage for user {user_id} by admin {current_user['id']}")
        else:
            # Fallback: Store in MongoDB as base64
            avatar_data = base64.b64encode(content).decode('utf-8')
            
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "avatar_data": avatar_data,
                    "avatar_content_type": content_type,
                    "avatar_storage": "mongodb",
                    "avatar_updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$unset": {"avatar_path": ""}}
            )
            
            logger.info(f"Avatar stored in MongoDB for user {user_id} by admin {current_user['id']}")
        
        # Invalidate user cache so new avatar is reflected immediately
        cache.invalidate_user(user_id)
        
        return {
            "message": "Avatar uploaded successfully"
        }
    
    except Exception as e:
        logger.error(f"Failed to upload avatar: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")



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



@router.post("/rbac/users/{user_id}/reset-intro")
async def reset_user_intro(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Reset the intro tour for a user.
    Sets has_seen_intro to False so the tour will show again on next login.
    """
    # Check if current user has permission (owner or admin)
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="Only owners and admins can reset user intro"
        )
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update the user's has_seen_intro flag
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"has_seen_intro": False}}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(status_code=500, detail="Failed to reset intro")
    
    logger.info(f"Intro tour reset for user {user_id} ({user.get('email')}) by {current_user['id']}")
    
    return {
        "message": "Intro tour will show on next login",
        "user_id": user_id,
        "user_name": user.get("name")
    }


@router.post("/users/mark-intro-seen")
async def mark_intro_seen(
    current_user: dict = Depends(get_current_user)
):
    """
    Mark the intro tour as seen for the current user.
    Called when user completes or skips the intro tour.
    """
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"has_seen_intro": True}}
    )
    
    return {"message": "Intro marked as seen"}
