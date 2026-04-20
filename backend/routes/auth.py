"""
Authentication routes with rate limiting and security features.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone, timedelta
import uuid
import secrets
import asyncio
import os
import re
import logging
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import db
from auth import hash_password, verify_password, create_token, get_current_user
from models.api_models import UserCreate, UserLogin, UserResponse, TokenResponse
from pydantic import BaseModel, EmailStr, field_validator

# Try to import resend for email functionality
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False

router = APIRouter(tags=["Authentication"])
logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Rate limit configurations
AUTH_RATE_LIMIT = "10/minute"  # 10 auth attempts per minute per IP
STRICT_AUTH_RATE_LIMIT = "5/minute"  # 5 attempts for sensitive operations

# Security configurations
MAX_LOGIN_ATTEMPTS = int(os.environ.get("MAX_LOGIN_ATTEMPTS", "5"))
LOCKOUT_DURATION_MINUTES = int(os.environ.get("LOCKOUT_DURATION_MINUTES", "15"))
MIN_PASSWORD_LENGTH = int(os.environ.get("MIN_PASSWORD_LENGTH", "8"))
REQUIRE_PASSWORD_COMPLEXITY = os.environ.get("REQUIRE_PASSWORD_COMPLEXITY", "true").lower() == "true"

# Email configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
# EMAIL_FRONTEND_URL is the URL used in emails - should be the live/production URL
EMAIL_FRONTEND_URL = os.environ.get("EMAIL_FRONTEND_URL") or os.environ.get("FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")

# Initialize Resend if available
if RESEND_AVAILABLE and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def validate_password_complexity(password: str) -> tuple[bool, str]:
    """
    Validate password meets complexity requirements.
    Returns (is_valid, error_message)
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    
    if not REQUIRE_PASSWORD_COMPLEXITY:
        return True, ""
    
    errors = []
    if not re.search(r'[A-Z]', password):
        errors.append("uppercase letter")
    if not re.search(r'[a-z]', password):
        errors.append("lowercase letter")
    if not re.search(r'\d', password):
        errors.append("number")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'`~]', password):
        errors.append("special character")
    
    if errors:
        return False, f"Password must contain: {', '.join(errors)}"
    
    return True, ""


async def check_account_lockout(email: str) -> tuple[bool, int]:
    """
    Check if account is locked due to failed login attempts.
    Returns (is_locked, remaining_minutes)
    """
    lockout = await db.login_attempts.find_one({"email": email.lower()})
    
    if not lockout:
        return False, 0
    
    if lockout.get("locked_until"):
        locked_until = lockout["locked_until"]
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
        
        now = datetime.now(timezone.utc)
        if now < locked_until:
            remaining = (locked_until - now).total_seconds() / 60
            return True, int(remaining) + 1
    
    return False, 0


async def record_login_attempt(email: str, success: bool, ip_address: str = None):
    """
    Record login attempt for brute force protection.
    """
    email_lower = email.lower()
    now = datetime.now(timezone.utc)
    
    if success:
        # Clear failed attempts on successful login
        await db.login_attempts.delete_one({"email": email_lower})
        
        # Update last_login on user
        await db.users.update_one(
            {"email": email_lower},
            {"$set": {"last_login": now.isoformat()}}
        )
        
        # Log successful login for audit
        await db.security_audit_log.insert_one({
            "event": "login_success",
            "email": email_lower,
            "ip_address": ip_address,
            "timestamp": now.isoformat(),
        })
        return
    
    # Get or create login attempt record
    attempt = await db.login_attempts.find_one({"email": email_lower})
    
    if attempt:
        failed_count = attempt.get("failed_count", 0) + 1
        
        update_data = {
            "failed_count": failed_count,
            "last_attempt": now.isoformat(),
        }
        
        # Lock account if max attempts reached
        if failed_count >= MAX_LOGIN_ATTEMPTS:
            locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            update_data["locked_until"] = locked_until.isoformat()
            
            # Log lockout event
            await db.security_audit_log.insert_one({
                "event": "account_locked",
                "email": email_lower,
                "ip_address": ip_address,
                "failed_count": failed_count,
                "locked_until": locked_until.isoformat(),
                "timestamp": now.isoformat(),
            })
            logger.warning(f"Account locked due to failed attempts: {email_lower}")
        
        await db.login_attempts.update_one(
            {"email": email_lower},
            {"$set": update_data}
        )
    else:
        await db.login_attempts.insert_one({
            "email": email_lower,
            "failed_count": 1,
            "last_attempt": now.isoformat(),
        })
    
    # Log failed attempt
    await db.security_audit_log.insert_one({
        "event": "login_failed",
        "email": email_lower,
        "ip_address": ip_address,
        "timestamp": now.isoformat(),
    })

# Pydantic models for password reset
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class VerifyResetTokenRequest(BaseModel):
    token: str

@router.post("/auth/register", response_model=dict)
@limiter.limit(AUTH_RATE_LIMIT)
async def register(request: Request, user_data: UserCreate):
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
        "approval_status": "pending",  # New users require approval
        "role": "viewer",  # Default role for new users
        "is_active": True,
        "has_seen_intro": False,  # Show intro tour on first login
    }
    await db.users.insert_one(user_doc)
    
    # Notify admins about new user (could send email notification)
    await notify_admins_new_user(user_data.email, user_data.name)
    
    # Return message instead of token (user cannot login until approved)
    return {
        "message": "Registration successful. Your account is pending approval by an administrator.",
        "status": "pending_approval",
        "user": {
            "email": user_data.email,
            "name": user_data.name,
        }
    }


async def notify_admins_new_user(user_email: str, user_name: str):
    """Notify owner(s) about new user registration requiring approval."""
    # Get owner users only
    owners = await db.users.find(
        {"role": "owner", "approval_status": {"$ne": "pending"}},
        {"_id": 0, "email": 1, "name": 1}
    ).to_list(100)
    
    if not owners:
        logger.info(f"No owners to notify about new user: {user_email}")
        return
    
    # Log the notification
    logger.info(f"New user registration requires approval: {user_name} ({user_email})")
    logger.info(f"Notifying {len(owners)} owner(s)")
    
    # If Resend is available, send email to owners
    if RESEND_AVAILABLE and RESEND_API_KEY:
        for owner in owners:
            try:
                await send_approval_notification_email(
                    admin_email=owner["email"],
                    admin_name=owner.get("name", "Owner"),
                    new_user_name=user_name,
                    new_user_email=user_email
                )
                logger.info(f"Sent approval notification to owner: {owner['email']}")
            except Exception as e:
                logger.error(f"Failed to send approval notification to {owner['email']}: {e}")

@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit(STRICT_AUTH_RATE_LIMIT)
async def login(request: Request, credentials: UserLogin):
    # Get client IP for audit logging
    ip_address = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    
    # Check if account is locked
    is_locked, remaining_minutes = await check_account_lockout(credentials.email)
    if is_locked:
        raise HTTPException(
            status_code=429,
            detail=f"Account is temporarily locked due to too many failed attempts. Try again in {remaining_minutes} minutes."
        )
    
    try:
        user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
        logger.info(f"Login attempt for {credentials.email}: user_found={user is not None}")
    except Exception as e:
        logger.error(f"Database error during login: {e}")
        raise HTTPException(status_code=503, detail="Database connection error. Please try again.")
    
    if not user:
        logger.warning(f"Login failed: user not found for {credentials.email}")
        await record_login_attempt(credentials.email, success=False, ip_address=ip_address)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        logger.warning(f"Login failed: invalid password for {credentials.email}")
        # Record failed attempt
        await record_login_attempt(credentials.email, success=False, ip_address=ip_address)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check approval status
    approval_status = user.get("approval_status", "approved")  # Default to approved for existing users
    if approval_status == "pending":
        raise HTTPException(
            status_code=403, 
            detail="Your account is pending approval. Please wait for an administrator to approve your account."
        )
    elif approval_status == "rejected":
        raise HTTPException(
            status_code=403,
            detail="Your account has been rejected. Please contact an administrator for more information."
        )
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="Your account has been deactivated. Please contact an administrator."
        )
    
    # Record successful login
    await record_login_attempt(credentials.email, success=True, ip_address=ip_address)
    
    token = create_token(user["id"])
    must_change_password = user.get("must_change_password", False)
    has_seen_intro = user.get("has_seen_intro", True)  # Default to True for existing users
    
    # Convert datetime to string for Pydantic model
    created_at = user.get("created_at")
    if hasattr(created_at, 'isoformat'):
        created_at = created_at.isoformat()
    elif not isinstance(created_at, str):
        created_at = str(created_at) if created_at else None
    
    return TokenResponse(
        token=token,
        must_change_password=must_change_password,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=created_at,
            department=user.get("department"),
            position=user.get("position"),
            role=user.get("role"),
            phone=user.get("phone"),
            must_change_password=must_change_password,
            has_seen_intro=has_seen_intro,
            default_simple_mode=user.get("default_simple_mode", False),
            terms_accepted_version=user.get("terms_accepted_version")
        )
    )

@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    # Build avatar URL if user has an avatar
    avatar_url = None
    if current_user.get("avatar_path") or current_user.get("avatar_data"):
        # Use the backend proxy endpoint so frontend can access it without storage auth
        avatar_url = f"/api/users/{current_user['id']}/avatar"
    
    # Convert datetime to string for Pydantic model
    created_at = current_user.get("created_at")
    if hasattr(created_at, 'isoformat'):
        created_at = created_at.isoformat()
    elif not isinstance(created_at, str):
        created_at = str(created_at) if created_at else None
    
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        created_at=created_at,
        department=current_user.get("department"),
        position=current_user.get("position"),
        role=current_user.get("role"),
        phone=current_user.get("phone"),
        must_change_password=current_user.get("must_change_password", False),
        has_seen_intro=current_user.get("has_seen_intro", True),
        avatar_url=avatar_url,
        default_simple_mode=current_user.get("default_simple_mode", False),
        terms_accepted_version=current_user.get("terms_accepted_version")
    )


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(
    request: Request,
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change user's password. Used for first-time login password change."""
    # Get client IP for audit logging
    ip_address = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    
    # Verify current password
    if not verify_password(data.current_password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password complexity
    is_valid, error_msg = validate_password_complexity(data.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Update password and clear must_change_password flag
    # Also reset has_seen_intro so the tour shows after password change
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "password_hash": hash_password(data.new_password),
                "must_change_password": False,
                "password_changed_at": datetime.now(timezone.utc).isoformat(),
                "has_seen_intro": False  # Trigger intro tour after password change
            }
        }
    )
    
    # Log password change for audit
    await db.security_audit_log.insert_one({
        "event": "password_changed",
        "user_id": current_user["id"],
        "email": current_user["email"],
        "ip_address": ip_address,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    
    logger.info(f"Password changed for user {current_user['email']}")
    
    return {"message": "Password changed successfully"}



# ==================== PASSWORD RESET ENDPOINTS ====================

def generate_reset_token():
    """Generate a secure random token for password reset."""
    return secrets.token_urlsafe(32)

async def send_reset_email(email: str, reset_token: str, user_name: str):
    """Send password reset email using Resend."""
    if not RESEND_AVAILABLE or not RESEND_API_KEY:
        logger.warning("Resend not configured. Email not sent.")
        return False
    
    reset_link = f"{EMAIL_FRONTEND_URL}/reset-password?token={reset_token}"
    
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
                                
                                <!-- Content -->
                                <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1e293b;">Reset Your Password</h2>
                                <p style="margin: 0 0 24px; font-size: 16px; color: #475569; line-height: 1.6;">
                                    Hi {user_name},<br><br>
                                    We received a request to reset your password. Click the button below to create a new password:
                                </p>
                                
                                <!-- Button -->
                                <div style="text-align: center; margin: 32px 0;">
                                    <a href="{reset_link}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                        Reset Password
                                    </a>
                                </div>
                                
                                <p style="margin: 0 0 16px; font-size: 14px; color: #64748b; line-height: 1.6;">
                                    This link will expire in <strong>1 hour</strong> for security reasons.
                                </p>
                                
                                <p style="margin: 0 0 16px; font-size: 14px; color: #64748b; line-height: 1.6;">
                                    If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                                </p>
                                
                                <!-- Divider -->
                                <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;">
                                
                                <!-- Footer -->
                                <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                    <a href="{reset_link}" style="color: #2563eb; word-break: break-all;">{reset_link}</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [email],
        "subject": "Reset Your AssetIQ Password",
        "html": html_content
    }
    
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Password reset email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send reset email to {email}: {type(e).__name__}: {str(e)}")
        return False


async def send_approval_notification_email(admin_email: str, admin_name: str, new_user_name: str, new_user_email: str):
    """Send notification to admin about new user requiring approval."""
    if not RESEND_AVAILABLE or not RESEND_API_KEY:
        logger.warning("Resend not configured. Email not sent.")
        return False
    
    approval_link = f"{EMAIL_FRONTEND_URL}/settings/users"
    
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
                                <div style="text-align: center; margin-bottom: 32px;">
                                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1e40af;">AssetIQ</h1>
                                    <p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">Asset Management Intelligence Platform</p>
                                </div>
                                
                                <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1e293b;">New User Awaiting Approval</h2>
                                <p style="margin: 0 0 24px; font-size: 16px; color: #475569; line-height: 1.6;">
                                    Hi {admin_name},<br><br>
                                    A new user has registered and is awaiting your approval:
                                </p>
                                
                                <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                                    <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;"><strong>Name:</strong> {new_user_name}</p>
                                    <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Email:</strong> {new_user_email}</p>
                                </div>
                                
                                <div style="text-align: center; margin: 32px 0;">
                                    <a href="{approval_link}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                        Review User
                                    </a>
                                </div>
                                
                                <p style="margin: 0; font-size: 14px; color: #94a3b8; text-align: center;">
                                    This is an automated notification from AssetIQ - Asset Management Intelligence Platform.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    try:
        resend.Emails.send({
            "from": SENDER_EMAIL,
            "to": admin_email,
            "subject": f"New User Awaiting Approval: {new_user_name}",
            "html": html_content
        })
        logger.info(f"Approval notification sent to {admin_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send approval notification: {str(e)}")
        return False


async def send_approval_result_email(user_email: str, user_name: str, approved: bool, rejection_reason: str = None):
    """Send notification to user about their account approval status."""
    if not RESEND_AVAILABLE or not RESEND_API_KEY:
        logger.warning("Resend not configured. Email not sent.")
        return False
    
    login_link = f"{EMAIL_FRONTEND_URL}/login"
    
    if approved:
        subject = "Your AssetIQ Account Has Been Approved"
        message = "Great news! Your account has been approved. You can now log in and start using the platform."
        button_text = "Log In Now"
        button_link = login_link
    else:
        subject = "Your AssetIQ Account Registration"
        message = "Unfortunately, your account registration was not approved."
        if rejection_reason:
            message += f"<br><br><strong>Reason:</strong> {rejection_reason}"
        message += "<br><br>If you believe this was a mistake, please contact an administrator."
        button_text = "Contact Support"
        button_link = "mailto:support@assetiq.com"
    
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
                                <div style="text-align: center; margin-bottom: 32px;">
                                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1e40af;">AssetIQ</h1>
                                    <p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">Asset Management Intelligence Platform</p>
                                </div>
                                
                                <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1e293b;">Account Update</h2>
                                <p style="margin: 0 0 24px; font-size: 16px; color: #475569; line-height: 1.6;">
                                    Hi {user_name},<br><br>
                                    {message}
                                </p>
                                
                                <div style="text-align: center; margin: 32px 0;">
                                    <a href="{button_link}" style="display: inline-block; padding: 14px 32px; background-color: {'#22c55e' if approved else '#64748b'}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                        {button_text}
                                    </a>
                                </div>
                            </td>
                        </tr>
                    </table>
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
            "subject": subject,
            "html": html_content
        })
        logger.info(f"Approval result email sent to {user_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send approval result email: {str(e)}")
        return False


@router.post("/auth/forgot-password")
@limiter.limit(STRICT_AUTH_RATE_LIMIT)
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    """
    Request a password reset. Sends an email with a reset link if the email exists.
    Returns user_found status to provide feedback to the user.
    """
    # Find user by email
    user = await db.users.find_one({"email": body.email}, {"_id": 0})
    
    if not user:
        # User not found - return feedback
        return {
            "status": "not_found",
            "user_found": False,
            "message": "No account found with this email address."
        }
    
    # User exists - generate reset token
    reset_token = generate_reset_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Store reset token in database
    await db.password_resets.delete_many({"email": body.email})  # Remove old tokens
    await db.password_resets.insert_one({
        "email": body.email,
        "token": reset_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
        "used": False
    })
    
    # Send email
    email_sent = await send_reset_email(
        email=body.email,
        reset_token=reset_token,
        user_name=user.get("name", "User")
    )
    
    if not email_sent:
        logger.warning(f"Could not send reset email to {body.email}. Returning direct reset link.")
        # Build the reset link so the frontend can show it as fallback
        reset_link = f"{EMAIL_FRONTEND_URL}/reset-password?token={reset_token}"
        return {
            "status": "email_error",
            "user_found": True,
            "message": "Account found but we couldn't send the email. Please try again later.",
            "reset_link": reset_link
        }
    
    return {
        "status": "success",
        "user_found": True,
        "message": "Password reset link sent to your email."
    }


class AdminResetPasswordRequest(BaseModel):
    user_id: str


@router.post("/auth/admin-reset-password")
async def admin_reset_password(request: AdminResetPasswordRequest, current_user: dict = Depends(get_current_user)):
    """
    Admin endpoint to trigger password reset email for a user.
    Only admins and owners can use this endpoint.
    """
    # Check if current user is admin or owner
    if current_user.get("role") not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Only admins can reset user passwords")
    
    # Find the target user
    user = await db.users.find_one({"id": request.user_id}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate reset token
    reset_token = generate_reset_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)  # 24 hours for admin-initiated resets
    
    # Store reset token in database
    await db.password_resets.delete_many({"email": user["email"]})  # Remove old tokens
    await db.password_resets.insert_one({
        "email": user["email"],
        "token": reset_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
        "used": False,
        "initiated_by": current_user.get("id")
    })
    
    # Send email
    email_sent = await send_reset_email(
        email=user["email"],
        reset_token=reset_token,
        user_name=user.get("name", "User")
    )
    
    if not email_sent:
        raise HTTPException(status_code=500, detail="Failed to send password reset email")
    
    logger.info(f"Admin {current_user.get('email')} initiated password reset for {user['email']}")
    
    return {
        "status": "success",
        "message": f"Password reset email sent to {user['email']}"
    }


@router.post("/auth/verify-reset-token")
@limiter.limit(AUTH_RATE_LIMIT)
async def verify_reset_token(request: Request, body: VerifyResetTokenRequest):
    """Verify if a reset token is valid."""
    reset_record = await db.password_resets.find_one({
        "token": body.token,
        "used": False
    }, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    
    # Check if token is expired
    expires_at = reset_record.get("expires_at")
    if expires_at:
        # Handle both datetime and string formats
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        # Make sure expires_at is timezone-aware
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Reset link has expired")
    
    return {
        "status": "valid",
        "email": reset_record["email"]
    }


@router.post("/auth/reset-password")
@limiter.limit(STRICT_AUTH_RATE_LIMIT)
async def reset_password(request: Request, body: ResetPasswordRequest):
    """Reset password using a valid token."""
    # Find and validate token
    reset_record = await db.password_resets.find_one({
        "token": body.token,
        "used": False
    }, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    
    # Check if token is expired
    expires_at = reset_record.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Reset link has expired")
    
    # Validate password strength
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Update user's password
    email = reset_record["email"]
    new_hash = hash_password(body.new_password)
    
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mark token as used
    await db.password_resets.update_one(
        {"token": body.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}}
    )
    
    return {
        "status": "success",
        "message": "Password has been reset successfully. You can now log in with your new password."
    }
