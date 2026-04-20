"""
GDPR Compliance Routes
Implements:
- Article 15: Right to Access (data export)
- Article 17: Right to Erasure (account deletion with owner approval)
- Article 20: Data Portability (machine-readable export)
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json

from database import db
from auth import get_current_user

# Try to import resend for email functionality
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False

logger = logging.getLogger(__name__)
router = APIRouter(tags=["GDPR"])

# Email configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://assetiq.tech")

if RESEND_AVAILABLE and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


class AccountDeletionRequest(BaseModel):
    """Request body for account deletion confirmation."""
    confirm_email: str
    reason: str = ""


class DeletionRequestAction(BaseModel):
    """Request body for approving/rejecting deletion requests."""
    action: str  # "approve" or "reject"
    rejection_reason: str = ""


class TermsAcceptanceRequest(BaseModel):
    """Request body for terms/privacy acceptance."""
    terms_version: str


class DataExportRequest(BaseModel):
    """Request body for data export options."""
    format: str = "json"  # json or csv
    include_activity: bool = True
    include_submissions: bool = True
    include_audit_logs: bool = True


# =============================================================================
# Terms and Privacy Acceptance (First Login)
# =============================================================================

@router.post("/gdpr/accept-terms")
async def accept_terms(
    request: TermsAcceptanceRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Accept terms of service and privacy policy.
    Called on first login or when terms are updated.
    """
    user_id = current_user["id"]
    user_email = current_user.get("email", "")
    
    logger.info(f"Terms acceptance by user {user_id} - version {request.terms_version}")
    
    acceptance_timestamp = datetime.now(timezone.utc).isoformat()
    
    # Update user record with terms acceptance
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "terms_accepted_version": request.terms_version,
            "terms_accepted_at": acceptance_timestamp,
            "privacy_accepted_version": request.terms_version,
            "privacy_accepted_at": acceptance_timestamp
        }}
    )
    
    # Log the acceptance for compliance audit trail
    await db.gdpr_consent_log.insert_one({
        "event": "terms_accepted",
        "user_id": user_id,
        "email": user_email,
        "terms_version": request.terms_version,
        "timestamp": acceptance_timestamp,
        "ip_address": "recorded_separately"  # Don't store IP directly
    })
    
    return {
        "message": "Terms and privacy policy accepted",
        "terms_version": request.terms_version,
        "accepted_at": acceptance_timestamp
    }


@router.get("/gdpr/terms-status")
async def get_terms_status(current_user: dict = Depends(get_current_user)):
    """
    Check if user has accepted current terms version.
    """
    user_id = current_user["id"]
    
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "terms_accepted_version": 1, "terms_accepted_at": 1}
    )
    
    return {
        "user_id": user_id,
        "terms_accepted_version": user.get("terms_accepted_version") if user else None,
        "terms_accepted_at": user.get("terms_accepted_at") if user else None,
        "current_terms_version": "1.0"  # Should match frontend CURRENT_TERMS_VERSION
    }


# =============================================================================
# Reset Consent Status (Owner-only)
# =============================================================================

class ResetConsentRequest(BaseModel):
    """Request body for resetting consent status."""
    user_ids: list = []  # Empty list means all users
    reset_terms: bool = True
    reset_privacy_consent: bool = False
    reason: str = ""


@router.post("/gdpr/reset-consent")
async def reset_consent_status(
    request: ResetConsentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Reset consent/terms acceptance status for users (owner-only).
    
    Users will be prompted to re-accept terms at their next login.
    Use this when terms of service or privacy policy have been updated.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can reset consent status"
        )
    
    reset_timestamp = datetime.now(timezone.utc).isoformat()
    update_fields = {}
    
    if request.reset_terms:
        update_fields["terms_accepted_version"] = None
        update_fields["terms_accepted_at"] = None
        update_fields["privacy_accepted_version"] = None
        update_fields["privacy_accepted_at"] = None
    
    if request.reset_privacy_consent:
        # Reset the consent preferences (analytics, marketing, etc.)
        update_fields["consent_reset_at"] = reset_timestamp
    
    if not update_fields:
        raise HTTPException(
            status_code=400,
            detail="No consent types selected for reset"
        )
    
    # Build query - either specific users or all users
    if request.user_ids and len(request.user_ids) > 0:
        query = {"id": {"$in": request.user_ids}}
        scope = f"{len(request.user_ids)} specific user(s)"
    else:
        # Reset all users except the current owner performing the action
        query = {"id": {"$ne": current_user["id"]}}
        scope = "all users"
    
    # Perform the reset
    result = await db.users.update_many(query, {"$set": update_fields})
    
    # If resetting privacy consent preferences, also clear the user_consents collection
    if request.reset_privacy_consent:
        if request.user_ids and len(request.user_ids) > 0:
            await db.user_consents.delete_many({"user_id": {"$in": request.user_ids}})
        else:
            await db.user_consents.delete_many({"user_id": {"$ne": current_user["id"]}})
    
    # Log the action for audit trail
    await db.security_audit_log.insert_one({
        "event": "consent_reset",
        "performed_by": current_user["id"],
        "performed_by_name": current_user.get("name", ""),
        "timestamp": reset_timestamp,
        "scope": scope,
        "user_ids": request.user_ids if request.user_ids else "all",
        "reset_terms": request.reset_terms,
        "reset_privacy_consent": request.reset_privacy_consent,
        "reason": request.reason,
        "users_affected": result.modified_count
    })
    
    logger.info(f"Consent reset by {current_user['id']}: {result.modified_count} users affected")
    
    return {
        "message": f"Consent status reset for {result.modified_count} user(s)",
        "details": {
            "users_affected": result.modified_count,
            "scope": scope,
            "reset_terms": request.reset_terms,
            "reset_privacy_consent": request.reset_privacy_consent,
            "performed_at": reset_timestamp
        }
    }


@router.get("/gdpr/consent-reset-history")
async def get_consent_reset_history(
    current_user: dict = Depends(get_current_user)
):
    """
    Get history of consent resets (owner-only).
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can view consent reset history"
        )
    
    cursor = db.security_audit_log.find(
        {"event": "consent_reset"},
        {"_id": 0}
    ).sort("timestamp", -1).limit(50)
    
    history = await cursor.to_list(length=50)
    
    return {"history": history}


@router.get("/gdpr/consent-acceptance-history")
async def get_consent_acceptance_history(
    current_user: dict = Depends(get_current_user),
    limit: int = 100
):
    """
    Get history of every consent acceptance across all users (owner-only).
    Combines terms acceptance events from gdpr_consent_log with owner-initiated
    resets so owners have a full compliance trail in one place.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can view consent acceptance history"
        )

    # Terms acceptance events logged when users accept the Terms dialog
    accept_cursor = db.gdpr_consent_log.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit)
    accepts = await accept_cursor.to_list(length=limit)

    # Owner-initiated resets
    reset_cursor = db.security_audit_log.find(
        {"event": "consent_reset"},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit)
    resets = await reset_cursor.to_list(length=limit)

    # Enrich with user names where possible
    user_ids = {e.get("user_id") for e in accepts + resets if e.get("user_id")}
    user_ids.discard(None)
    name_map = {}
    if user_ids:
        u_cursor = db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "name": 1, "email": 1}
        )
        async for u in u_cursor:
            name_map[u["id"]] = {"name": u.get("name"), "email": u.get("email")}

    combined = []
    for e in accepts:
        uid = e.get("user_id")
        combined.append({
            "timestamp": e.get("timestamp"),
            "event": e.get("event", "terms_accepted"),
            "user_id": uid,
            "user_name": (name_map.get(uid) or {}).get("name") or e.get("email") or "Unknown",
            "user_email": (name_map.get(uid) or {}).get("email") or e.get("email"),
            "terms_version": e.get("terms_version"),
            "details": None,
        })
    for e in resets:
        uid = e.get("user_id")
        combined.append({
            "timestamp": e.get("timestamp"),
            "event": "consent_reset",
            "user_id": uid,
            "user_name": e.get("performed_by_name") or "Owner",
            "user_email": e.get("performed_by_email"),
            "terms_version": None,
            "details": {
                "scope": e.get("scope"),
                "users_affected": e.get("users_affected"),
                "reason": e.get("reason"),
            },
        })

    # Sort merged list by timestamp descending
    combined.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return {"history": combined[:limit]}


@router.get("/gdpr/user-consent/{user_id}")
async def get_user_consent_details(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get detailed consent information for a specific user (owner-only).
    Includes terms acceptance, consent preferences, and consent history.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can view user consent details"
        )
    
    # Get user data
    user = await db.users.find_one(
        {"id": user_id},
        {
            "_id": 0,
            "id": 1,
            "email": 1,
            "name": 1,
            "role": 1,
            "created_at": 1,
            "last_login": 1,
            "terms_accepted_version": 1,
            "terms_accepted_at": 1,
            "privacy_accepted_version": 1,
            "privacy_accepted_at": 1
        }
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's consent preferences
    consent_prefs = await db.user_consents.find_one(
        {"user_id": user_id},
        {"_id": 0}
    )
    
    # Get consent history for this user
    consent_history_cursor = db.gdpr_consent_log.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(20)
    consent_history = await consent_history_cursor.to_list(length=20)
    
    # Get security audit events related to consent for this user
    audit_cursor = db.security_audit_log.find(
        {
            "user_id": user_id,
            "event": {"$in": ["terms_accepted", "consent_updated", "gdpr_data_export"]}
        },
        {"_id": 0}
    ).sort("timestamp", -1).limit(20)
    audit_history = await audit_cursor.to_list(length=20)
    
    current_version = "1.0"
    
    return {
        "user": {
            "id": user["id"],
            "email": user.get("email"),
            "name": user.get("name"),
            "role": user.get("role"),
            "created_at": user.get("created_at"),
            "last_login": user.get("last_login")
        },
        "terms_acceptance": {
            "current_version": current_version,
            "accepted_version": user.get("terms_accepted_version"),
            "accepted_at": user.get("terms_accepted_at"),
            "is_current": user.get("terms_accepted_version") == current_version,
            "privacy_accepted_version": user.get("privacy_accepted_version"),
            "privacy_accepted_at": user.get("privacy_accepted_at")
        },
        "consent_preferences": consent_prefs.get("consents", {
            "essential_cookies": True,
            "analytics": False,
            "marketing_emails": False,
            "ai_processing": True
        }) if consent_prefs else {
            "essential_cookies": True,
            "analytics": False,
            "marketing_emails": False,
            "ai_processing": True
        },
        "consent_preferences_updated_at": consent_prefs.get("last_updated") if consent_prefs else None,
        "consent_history": consent_history,
        "audit_history": audit_history
    }


@router.get("/gdpr/users-consent-status")
async def get_users_consent_status(
    current_user: dict = Depends(get_current_user)
):
    """
    Get consent status for all users (owner-only).
    Shows which users have accepted terms and which haven't.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can view users consent status"
        )
    
    cursor = db.users.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "email": 1,
            "name": 1,
            "role": 1,
            "terms_accepted_version": 1,
            "terms_accepted_at": 1,
            "last_login": 1,
            "created_at": 1
        }
    ).sort("name", 1)
    
    users = await cursor.to_list(length=500)
    
    # Get all user consent preferences
    consent_cursor = db.user_consents.find({}, {"_id": 0})
    all_consents = await consent_cursor.to_list(length=500)
    consent_map = {c["user_id"]: c for c in all_consents}
    
    current_version = "1.0"
    
    # Categorize users with full consent info
    accepted = []
    pending = []
    
    for user in users:
        user_consent = consent_map.get(user["id"], {})
        consents = user_consent.get("consents", {})
        
        user_data = {
            "id": user["id"],
            "email": user.get("email"),
            "name": user.get("name"),
            "role": user.get("role"),
            "created_at": user.get("created_at"),
            "last_login": user.get("last_login"),
            "terms_accepted_version": user.get("terms_accepted_version"),
            "terms_accepted_at": user.get("terms_accepted_at"),
            "consent_preferences": {
                "analytics": consents.get("analytics", False),
                "marketing_emails": consents.get("marketing_emails", False),
                "ai_processing": consents.get("ai_processing", True)
            },
            "consent_updated_at": user_consent.get("last_updated")
        }
        
        if user.get("terms_accepted_version") == current_version:
            accepted.append(user_data)
        else:
            pending.append(user_data)
    
    return {
        "current_terms_version": current_version,
        "summary": {
            "total_users": len(users),
            "accepted": len(accepted),
            "pending": len(pending)
        },
        "accepted_users": accepted,
        "pending_users": pending
    }


# =============================================================================
# Article 15: Right to Access - Data Export
# =============================================================================

@router.get("/gdpr/export")
async def export_user_data(
    format: str = "json",
    current_user: dict = Depends(get_current_user)
):
    """
    Export all personal data for the current user (GDPR Article 15 & 20).
    
    Returns all data associated with the user in machine-readable format.
    """
    user_id = current_user["id"]
    user_email = current_user.get("email", "")
    
    logger.info(f"GDPR data export requested by user {user_id}")
    
    # Collect all user data from various collections
    export_data = {
        "export_metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "format": format,
            "gdpr_article": "Article 15 - Right of Access & Article 20 - Data Portability"
        },
        "profile": {},
        "activity": {},
        "submissions": [],
        "observations": [],
        "actions": [],
        "investigations": [],
        "audit_logs": [],
        "preferences": {},
    }
    
    # 1. User Profile Data
    user_profile = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "password_hash": 0}  # Exclude sensitive fields
    )
    if user_profile:
        export_data["profile"] = {
            "id": user_profile.get("id"),
            "email": user_profile.get("email"),
            "name": user_profile.get("name"),
            "role": user_profile.get("role"),
            "position": user_profile.get("position"),
            "phone": user_profile.get("phone"),
            "location": user_profile.get("location"),
            "department": user_profile.get("department"),
            "plant_unit": user_profile.get("plant_unit"),
            "created_at": user_profile.get("created_at"),
            "last_login": user_profile.get("last_login"),
            "assigned_installations": user_profile.get("assigned_installations", []),
            "preferences": user_profile.get("preferences", {}),
        }
    
    # 2. Form Submissions
    submissions_cursor = db.form_submissions.find(
        {"submitted_by": user_id},
        {"_id": 0}
    )
    export_data["submissions"] = await submissions_cursor.to_list(length=1000)
    
    # 3. Observations created by user
    observations_cursor = db.threats.find(
        {"created_by": user_id},
        {"_id": 0}
    )
    export_data["observations"] = await observations_cursor.to_list(length=1000)
    
    # 4. Actions created or assigned to user
    actions_cursor = db.central_actions.find(
        {"$or": [{"created_by": user_id}, {"assigned_to": user_id}]},
        {"_id": 0}
    )
    export_data["actions"] = await actions_cursor.to_list(length=1000)
    
    # 5. Investigations led by user
    investigations_cursor = db.investigations.find(
        {"$or": [{"created_by": user_id}, {"lead_id": user_id}]},
        {"_id": 0}
    )
    export_data["investigations"] = await investigations_cursor.to_list(length=1000)
    
    # 6. Task instances assigned to user
    tasks_cursor = db.task_instances.find(
        {"assigned_to": user_id},
        {"_id": 0}
    )
    export_data["activity"]["tasks"] = await tasks_cursor.to_list(length=1000)
    
    # 7. Security Audit Logs (related to this user)
    audit_cursor = db.security_audit_log.find(
        {"$or": [{"user_id": user_id}, {"email": user_email}]},
        {"_id": 0}
    )
    export_data["audit_logs"] = await audit_cursor.to_list(length=500)
    
    # 8. User statistics
    stats = await db.user_stats.find_one({"user_id": user_id}, {"_id": 0})
    if stats:
        export_data["activity"]["statistics"] = stats
    
    # 9. Chat history
    chat_cursor = db.chat_messages.find(
        {"user_id": user_id},
        {"_id": 0}
    )
    export_data["activity"]["chat_history"] = await chat_cursor.to_list(length=500)
    
    # Log the export event
    await db.security_audit_log.insert_one({
        "event": "gdpr_data_export",
        "user_id": user_id,
        "email": user_email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {
            "format": format,
            "records_exported": {
                "submissions": len(export_data["submissions"]),
                "observations": len(export_data["observations"]),
                "actions": len(export_data["actions"]),
                "investigations": len(export_data["investigations"]),
                "audit_logs": len(export_data["audit_logs"]),
            }
        }
    })
    
    if format == "json":
        # Return as downloadable JSON file
        return Response(
            content=json.dumps(export_data, indent=2, default=str),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="gdpr_export_{user_id}_{datetime.now().strftime("%Y%m%d")}.json"'
            }
        )
    else:
        # Return JSON response for API consumption
        return export_data


# =============================================================================
# Article 17: Right to Erasure (Right to be Forgotten) - WITH OWNER APPROVAL
# =============================================================================

async def send_deletion_request_email(owner_email: str, owner_name: str, requester_name: str, requester_email: str, request_id: str, reason: str):
    """Send email to owner notifying them of a deletion request."""
    if not RESEND_AVAILABLE or not RESEND_API_KEY:
        logger.warning("Resend not configured - skipping deletion request email")
        return False
    
    try:
        approval_url = f"{FRONTEND_URL}/settings/deletion-requests"
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Account Deletion Request</h1>
            </div>
            <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #334155; font-size: 16px; margin-bottom: 20px;">
                    Hello {owner_name},
                </p>
                <p style="color: #334155; font-size: 16px; margin-bottom: 20px;">
                    A user has requested to delete their account and requires your approval:
                </p>
                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                    <p style="margin: 5px 0;"><strong>User:</strong> {requester_name}</p>
                    <p style="margin: 5px 0;"><strong>Email:</strong> {requester_email}</p>
                    <p style="margin: 5px 0;"><strong>Reason:</strong> {reason or 'No reason provided'}</p>
                    <p style="margin: 5px 0;"><strong>Request ID:</strong> {request_id[:8]}...</p>
                </div>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">
                    Under GDPR Article 17, users have the right to request deletion of their personal data.
                    Please review this request and take appropriate action.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{approval_url}" style="background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Review Request
                    </a>
                </div>
                <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                    This is an automated message from AssetIQ. Please do not reply to this email.
                </p>
            </div>
        </div>
        """
        
        resend.Emails.send({
            "from": SENDER_EMAIL,
            "to": owner_email,
            "subject": f"[Action Required] Account Deletion Request - {requester_name}",
            "html": html_content
        })
        
        logger.info(f"Deletion request email sent to owner {owner_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send deletion request email: {e}")
        return False


async def send_deletion_result_email(user_email: str, user_name: str, approved: bool, rejection_reason: str = ""):
    """Send email to user notifying them of the deletion request result."""
    if not RESEND_AVAILABLE or not RESEND_API_KEY:
        logger.warning("Resend not configured - skipping deletion result email")
        return False
    
    try:
        if approved:
            subject = "Your Account Deletion Request Has Been Approved"
            message = "Your account and personal data have been permanently deleted as requested."
            color = "#22c55e"
        else:
            subject = "Your Account Deletion Request Has Been Declined"
            message = f"Your account deletion request has been declined."
            if rejection_reason:
                message += f"<br><br><strong>Reason:</strong> {rejection_reason}"
            color = "#ef4444"
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: {color}; padding: 30px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">{'Request Approved' if approved else 'Request Declined'}</h1>
            </div>
            <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #334155; font-size: 16px; margin-bottom: 20px;">
                    Hello {user_name},
                </p>
                <p style="color: #334155; font-size: 16px; margin-bottom: 20px;">
                    {message}
                </p>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">
                    If you have any questions, please contact your system administrator.
                </p>
                <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                    This is an automated message from AssetIQ.
                </p>
            </div>
        </div>
        """
        
        resend.Emails.send({
            "from": SENDER_EMAIL,
            "to": user_email,
            "subject": subject,
            "html": html_content
        })
        
        logger.info(f"Deletion result email sent to {user_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send deletion result email: {e}")
        return False


@router.post("/gdpr/delete-account")
async def request_account_deletion(
    request: AccountDeletionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Request deletion of own account (GDPR Article 17 - Right to Erasure).
    
    This creates a deletion request that must be approved by an owner.
    The user will be notified via email once the request is processed.
    """
    user_id = current_user["id"]
    user_email = current_user.get("email", "")
    user_name = current_user.get("name", "")
    
    # Verify email confirmation matches
    if request.confirm_email.lower() != user_email.lower():
        raise HTTPException(
            status_code=400,
            detail="Email confirmation does not match your account email"
        )
    
    # Check if user is an owner - owners cannot delete themselves
    if current_user.get("role") == "owner":
        raise HTTPException(
            status_code=400,
            detail="Account owners cannot delete their own account. Please transfer ownership first or contact an administrator."
        )
    
    # Check for existing pending request
    existing_request = await db.deletion_requests.find_one({
        "user_id": user_id,
        "status": "pending"
    })
    
    if existing_request:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending deletion request. Please wait for it to be processed."
        )
    
    logger.info(f"GDPR account deletion requested by user {user_id} ({user_email})")
    
    request_id = str(uuid.uuid4())
    request_timestamp = datetime.now(timezone.utc).isoformat()
    
    # Create deletion request
    deletion_request = {
        "id": request_id,
        "user_id": user_id,
        "user_email": user_email,
        "user_name": user_name,
        "reason": request.reason,
        "status": "pending",  # pending, approved, rejected
        "created_at": request_timestamp,
        "updated_at": request_timestamp,
        "processed_by": None,
        "processed_at": None,
        "rejection_reason": None
    }
    
    await db.deletion_requests.insert_one(deletion_request)
    
    # Log the request for compliance
    await db.security_audit_log.insert_one({
        "event": "deletion_request_created",
        "user_id": user_id,
        "email": user_email,
        "request_id": request_id,
        "timestamp": request_timestamp,
        "reason": request.reason
    })
    
    # Find all owners and send them emails
    owners_cursor = db.users.find(
        {"role": "owner"},
        {"_id": 0, "id": 1, "email": 1, "name": 1}
    )
    owners = await owners_cursor.to_list(length=100)
    
    emails_sent = 0
    for owner in owners:
        success = await send_deletion_request_email(
            owner_email=owner["email"],
            owner_name=owner.get("name", "Administrator"),
            requester_name=user_name,
            requester_email=user_email,
            request_id=request_id,
            reason=request.reason
        )
        if success:
            emails_sent += 1
    
    logger.info(f"Deletion request {request_id} created. Notified {emails_sent} owner(s).")
    
    return {
        "message": "Your deletion request has been submitted for approval",
        "details": {
            "request_id": request_id,
            "status": "pending",
            "created_at": request_timestamp,
            "owners_notified": emails_sent,
            "gdpr_article": "Article 17 - Right to Erasure",
            "note": "You will receive an email once your request has been processed."
        }
    }


@router.get("/gdpr/my-deletion-request")
async def get_my_deletion_request(current_user: dict = Depends(get_current_user)):
    """
    Get the current user's pending deletion request status.
    """
    user_id = current_user["id"]
    
    request = await db.deletion_requests.find_one(
        {"user_id": user_id},
        {"_id": 0},
        sort=[("created_at", -1)]  # Get most recent
    )
    
    if not request:
        return {"has_pending_request": False, "request": None}
    
    return {
        "has_pending_request": request["status"] == "pending",
        "request": request
    }


@router.delete("/gdpr/cancel-deletion-request")
async def cancel_deletion_request(current_user: dict = Depends(get_current_user)):
    """
    Cancel a pending deletion request.
    """
    user_id = current_user["id"]
    
    result = await db.deletion_requests.delete_one({
        "user_id": user_id,
        "status": "pending"
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No pending deletion request found"
        )
    
    await db.security_audit_log.insert_one({
        "event": "deletion_request_cancelled",
        "user_id": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Your deletion request has been cancelled"}


# =============================================================================
# Owner-only endpoints for managing deletion requests
# =============================================================================

@router.get("/gdpr/deletion-requests")
async def get_deletion_requests(
    status: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all deletion requests (owners only).
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can view deletion requests"
        )
    
    query = {}
    if status:
        query["status"] = status
    
    cursor = db.deletion_requests.find(query, {"_id": 0}).sort("created_at", -1)
    requests = await cursor.to_list(length=100)
    
    return {"requests": requests, "total": len(requests)}


@router.post("/gdpr/deletion-requests/{request_id}/action")
async def process_deletion_request(
    request_id: str,
    action_request: DeletionRequestAction,
    current_user: dict = Depends(get_current_user)
):
    """
    Approve or reject a deletion request (owners only).
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can process deletion requests"
        )
    
    if action_request.action not in ["approve", "reject"]:
        raise HTTPException(
            status_code=400,
            detail="Action must be 'approve' or 'reject'"
        )
    
    # Get the deletion request
    deletion_request = await db.deletion_requests.find_one({"id": request_id})
    
    if not deletion_request:
        raise HTTPException(status_code=404, detail="Deletion request not found")
    
    if deletion_request["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Request has already been {deletion_request['status']}"
        )
    
    user_id = deletion_request["user_id"]
    user_email = deletion_request["user_email"]
    user_name = deletion_request["user_name"]
    process_timestamp = datetime.now(timezone.utc).isoformat()
    
    if action_request.action == "approve":
        # Execute the actual deletion
        anonymized_name = "Deleted User"
        anonymized_email = f"deleted_{user_id[:8]}@anonymized.local"
        
        try:
            # 1. Anonymize form submissions
            await db.form_submissions.update_many(
                {"submitted_by": user_id},
                {"$set": {
                    "submitted_by_name": anonymized_name,
                    "submitted_by_anonymized": True,
                    "anonymized_at": process_timestamp
                }}
            )
            
            # 2. Anonymize observations
            await db.threats.update_many(
                {"created_by": user_id},
                {"$set": {
                    "creator_name": anonymized_name,
                    "anonymized": True,
                    "anonymized_at": process_timestamp
                }}
            )
            
            # 3. Anonymize actions
            await db.central_actions.update_many(
                {"created_by": user_id},
                {"$set": {"creator_name": anonymized_name, "anonymized": True}}
            )
            await db.central_actions.update_many(
                {"assigned_to": user_id},
                {"$set": {"assigned_to": None, "assigned_to_name": "Unassigned (User Deleted)"}}
            )
            
            # 4. Anonymize investigations
            await db.investigations.update_many(
                {"$or": [{"created_by": user_id}, {"lead_id": user_id}]},
                {"$set": {"lead_name": anonymized_name, "anonymized": True}}
            )
            
            # 5. Delete user data
            await db.chat_messages.delete_many({"user_id": user_id})
            await db.chat_conversations.delete_many({"user_id": user_id})
            await db.user_stats.delete_many({"user_id": user_id})
            await db.password_resets.delete_many({"email": user_email})
            await db.login_attempts.delete_many({"email": user_email.lower()})
            await db.user_preferences.delete_many({"user_id": user_id})
            
            # 6. Log the deletion
            await db.gdpr_deletion_log.insert_one({
                "event": "account_deletion_approved",
                "original_user_id": user_id,
                "original_email": user_email,
                "anonymized_email": anonymized_email,
                "deletion_reason": deletion_request.get("reason", ""),
                "approved_by": current_user["id"],
                "approved_by_name": current_user.get("name", ""),
                "timestamp": process_timestamp,
                "data_anonymized": True
            })
            
            # 7. Delete the user record
            await db.users.delete_one({"id": user_id})
            
            # 8. Update request status
            await db.deletion_requests.update_one(
                {"id": request_id},
                {"$set": {
                    "status": "approved",
                    "processed_by": current_user["id"],
                    "processed_by_name": current_user.get("name", ""),
                    "processed_at": process_timestamp,
                    "updated_at": process_timestamp
                }}
            )
            
            # 9. Send confirmation email to user (they're deleted but email is still valid temporarily)
            await send_deletion_result_email(user_email, user_name, approved=True)
            
            logger.info(f"Deletion request {request_id} approved by {current_user['id']}")
            
            return {
                "message": f"Account for {user_name} has been deleted",
                "request_id": request_id,
                "status": "approved",
                "processed_at": process_timestamp
            }
            
        except Exception as e:
            logger.error(f"Failed to execute deletion for request {request_id}: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to delete account. Please try again."
            )
    
    else:  # reject
        await db.deletion_requests.update_one(
            {"id": request_id},
            {"$set": {
                "status": "rejected",
                "processed_by": current_user["id"],
                "processed_by_name": current_user.get("name", ""),
                "processed_at": process_timestamp,
                "updated_at": process_timestamp,
                "rejection_reason": action_request.rejection_reason
            }}
        )
        
        # Send rejection email to user
        await send_deletion_result_email(
            user_email, 
            user_name, 
            approved=False, 
            rejection_reason=action_request.rejection_reason
        )
        
        await db.security_audit_log.insert_one({
            "event": "deletion_request_rejected",
            "request_id": request_id,
            "user_id": user_id,
            "rejected_by": current_user["id"],
            "rejection_reason": action_request.rejection_reason,
            "timestamp": process_timestamp
        })
        
        logger.info(f"Deletion request {request_id} rejected by {current_user['id']}")
        
        return {
            "message": f"Deletion request for {user_name} has been rejected",
            "request_id": request_id,
            "status": "rejected",
            "processed_at": process_timestamp
        }


@router.get("/gdpr/deletion-status")
async def get_deletion_status(current_user: dict = Depends(get_current_user)):
    """
    Check if user has any pending data or can safely delete account.
    """
    user_id = current_user["id"]
    
    # Check for owned/assigned items that would be affected
    status = {
        "can_delete": True,
        "warnings": [],
        "data_summary": {}
    }
    
    # Count records in each collection
    submissions_count = await db.form_submissions.count_documents({"submitted_by": user_id})
    observations_count = await db.threats.count_documents({"created_by": user_id})
    actions_count = await db.central_actions.count_documents(
        {"$or": [{"created_by": user_id}, {"assigned_to": user_id}]}
    )
    investigations_count = await db.investigations.count_documents(
        {"$or": [{"created_by": user_id}, {"lead_id": user_id}]}
    )
    
    status["data_summary"] = {
        "form_submissions": submissions_count,
        "observations": observations_count,
        "actions": actions_count,
        "investigations": investigations_count
    }
    
    # Add warnings for significant data
    if investigations_count > 0:
        status["warnings"].append(
            f"You are leading {investigations_count} investigation(s). These will be anonymized."
        )
    
    if actions_count > 0:
        status["warnings"].append(
            f"You have {actions_count} action(s) assigned. These will be unassigned."
        )
    
    # Check if user is an owner
    if current_user.get("role") == "owner":
        status["can_delete"] = False
        status["warnings"].append(
            "Account owners cannot delete their own account. Transfer ownership first."
        )
    
    return status


# =============================================================================
# Terms of Service Endpoint
# =============================================================================

@router.get("/gdpr/terms-of-service")
async def get_terms_of_service():
    """
    Returns the application's Terms of Service content.
    """
    return {
        "title": "Terms of Service",
        "last_updated": "2026-04-20",
        "version": "1.0",
        "effective_date": "2026-04-20",
        "sections": [
            {
                "title": "1. Acceptance of Terms",
                "content": "By accessing or using AssetIQ (the 'Service'), you agree to be bound by these Terms of Service ('Terms'). If you do not agree to these Terms, you may not access or use the Service.",
                "items": [
                    "These Terms constitute a legally binding agreement between you and AssetIQ",
                    "You must be at least 18 years old to use the Service",
                    "If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms"
                ]
            },
            {
                "title": "2. Description of Service",
                "content": "AssetIQ is an industrial asset management platform that provides:",
                "items": [
                    "Equipment hierarchy management and tracking",
                    "Risk assessment and reliability analysis tools",
                    "Form creation, submission, and workflow management",
                    "Observation and action tracking capabilities",
                    "AI-powered insights and analysis features",
                    "Reporting and data visualization tools",
                    "QR code-based asset identification",
                    "Production log ingestion and analysis"
                ]
            },
            {
                "title": "3. User Accounts",
                "content": "To use the Service, you must create an account. You agree to:",
                "items": [
                    "Provide accurate, current, and complete information during registration",
                    "Maintain and promptly update your account information",
                    "Maintain the security of your password and accept responsibility for all activities under your account",
                    "Notify us immediately of any unauthorized use of your account",
                    "Not share your account credentials with others",
                    "Not create accounts for the purpose of violating these Terms"
                ]
            },
            {
                "title": "4. Acceptable Use",
                "content": "You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree NOT to:",
                "items": [
                    "Use the Service in any way that violates any applicable law or regulation",
                    "Attempt to gain unauthorized access to any part of the Service",
                    "Interfere with or disrupt the integrity or performance of the Service",
                    "Transmit any viruses, malware, or other malicious code",
                    "Collect or harvest any information from the Service without authorization",
                    "Use the Service to store or transmit infringing, libelous, or unlawful material",
                    "Use the Service to store or transmit material that violates third-party privacy rights",
                    "Impersonate any person or entity or misrepresent your affiliation"
                ]
            },
            {
                "title": "5. Intellectual Property",
                "content": "The Service and its original content, features, and functionality are owned by AssetIQ and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.",
                "items": [
                    "You retain ownership of any data you input into the Service",
                    "You grant us a license to use, store, and process your data to provide the Service",
                    "You may not copy, modify, distribute, sell, or lease any part of the Service",
                    "You may not reverse engineer or attempt to extract the source code of the Service",
                    "Feedback and suggestions you provide may be used by us without any obligation to you"
                ]
            },
            {
                "title": "6. Data and Content",
                "content": "You are responsible for all data and content you upload to the Service.",
                "items": [
                    "You represent that you have all necessary rights to upload your content",
                    "You are responsible for maintaining backups of your data",
                    "We may remove content that violates these Terms or applicable laws",
                    "We are not responsible for the accuracy or reliability of user-generated content",
                    "Data processing is subject to our Privacy Policy"
                ]
            },
            {
                "title": "7. Service Availability",
                "content": "We strive to maintain high availability of the Service, but we do not guarantee uninterrupted access.",
                "items": [
                    "The Service is provided on an 'as is' and 'as available' basis",
                    "We may perform scheduled maintenance with advance notice when possible",
                    "We may suspend or terminate the Service for security, legal, or operational reasons",
                    "We are not liable for any downtime, data loss, or service interruptions",
                    "Target uptime is 99.9% but is not guaranteed"
                ]
            },
            {
                "title": "8. Fees and Payment",
                "content": "Access to the Service may require payment of fees.",
                "items": [
                    "Fees are set by your organization's subscription agreement",
                    "All fees are non-refundable unless otherwise specified",
                    "We reserve the right to change fees with 30 days notice",
                    "Failure to pay may result in suspension or termination of access"
                ]
            },
            {
                "title": "9. Limitation of Liability",
                "content": "To the maximum extent permitted by law:",
                "items": [
                    "AssetIQ shall not be liable for any indirect, incidental, special, consequential, or punitive damages",
                    "Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim",
                    "We are not liable for any loss of data, profits, or business opportunities",
                    "We are not liable for actions taken based on AI-generated insights or recommendations",
                    "These limitations apply regardless of the theory of liability"
                ]
            },
            {
                "title": "10. Indemnification",
                "content": "You agree to indemnify and hold harmless AssetIQ and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses arising out of:",
                "items": [
                    "Your use of the Service",
                    "Your violation of these Terms",
                    "Your violation of any third-party rights",
                    "Any content you upload or share through the Service"
                ]
            },
            {
                "title": "11. Termination",
                "content": "Either party may terminate the use of the Service:",
                "items": [
                    "You may request account deletion through the Privacy & Data settings",
                    "Account deletion requests require owner approval for compliance purposes",
                    "We may terminate or suspend your account for violation of these Terms",
                    "Upon termination, your right to use the Service ceases immediately",
                    "Data retention after termination is governed by our Privacy Policy and applicable laws"
                ]
            },
            {
                "title": "12. Changes to Terms",
                "content": "We may modify these Terms at any time.",
                "items": [
                    "We will notify you of material changes via email or in-app notification",
                    "Continued use of the Service after changes constitutes acceptance",
                    "If you do not agree to the modified Terms, you must stop using the Service",
                    "The 'Last Updated' date at the top indicates the most recent revision"
                ]
            },
            {
                "title": "13. Governing Law",
                "content": "These Terms shall be governed by and construed in accordance with the laws of the European Union and the applicable member state, without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration or in the courts of competent jurisdiction."
            },
            {
                "title": "14. Severability",
                "content": "If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect."
            },
            {
                "title": "15. Contact Information",
                "content": "For questions about these Terms, please contact your system administrator or reach out through the in-app feedback system."
            }
        ]
    }


# =============================================================================
# Privacy Policy Endpoint
# =============================================================================

@router.get("/gdpr/privacy-policy")
async def get_privacy_policy():
    """
    Returns the application's privacy policy content.
    """
    return {
        "title": "Privacy Policy",
        "last_updated": "2026-04-20",
        "version": "1.0",
        "sections": [
            {
                "title": "1. Data Controller",
                "content": "AssetIQ is the data controller for personal data processed through this application. For any privacy-related inquiries, please contact your system administrator."
            },
            {
                "title": "2. Personal Data We Collect",
                "content": "We collect and process the following personal data:",
                "items": [
                    "Account information: name, email address, phone number, position, department",
                    "Authentication data: encrypted passwords, login timestamps",
                    "Activity data: form submissions, observations, actions, task completions",
                    "Technical data: IP addresses (in security logs), browser type, access times"
                ]
            },
            {
                "title": "3. Legal Basis for Processing",
                "content": "We process your data based on:",
                "items": [
                    "Contract performance: To provide the asset management services",
                    "Legitimate interests: For security, analytics, and service improvement",
                    "Legal obligations: To comply with regulatory requirements",
                    "Consent: For optional features like email notifications"
                ]
            },
            {
                "title": "4. Data Retention",
                "content": "We retain your data for the following periods:",
                "items": [
                    "Account data: Until account deletion or 2 years after last activity",
                    "Activity logs: 5 years (for compliance and audit purposes)",
                    "Security logs: 1 year",
                    "Deleted account audit records: 7 years (legal requirement)"
                ]
            },
            {
                "title": "5. Your Rights (GDPR Articles 15-22)",
                "content": "Under GDPR, you have the following rights:",
                "items": [
                    "Right to Access (Art. 15): Request a copy of your personal data",
                    "Right to Rectification (Art. 16): Correct inaccurate data via profile settings",
                    "Right to Erasure (Art. 17): Request deletion of your account and data",
                    "Right to Data Portability (Art. 20): Export your data in machine-readable format",
                    "Right to Object (Art. 21): Object to certain processing activities",
                    "Right to Restrict Processing (Art. 18): Request limitation of processing"
                ]
            },
            {
                "title": "6. Data Security",
                "content": "We implement appropriate security measures including:",
                "items": [
                    "Password encryption using bcrypt",
                    "JWT-based secure authentication",
                    "HTTPS encryption for all data transmission",
                    "Rate limiting to prevent brute force attacks",
                    "Regular security audits and monitoring"
                ]
            },
            {
                "title": "7. Third-Party Services",
                "content": "We may share data with the following third-party services:",
                "items": [
                    "Cloud infrastructure providers (for hosting)",
                    "Email service providers (for notifications)",
                    "AI services (for analysis features, data processed per their privacy policies)"
                ]
            },
            {
                "title": "8. International Transfers",
                "content": "Your data may be transferred to and processed in countries outside the EEA. We ensure appropriate safeguards are in place, such as Standard Contractual Clauses."
            },
            {
                "title": "9. Contact & Complaints",
                "content": "For privacy inquiries or to exercise your rights, contact your system administrator. You also have the right to lodge a complaint with your local Data Protection Authority."
            }
        ]
    }


# =============================================================================
# Consent Management
# =============================================================================

@router.get("/gdpr/consent-status")
async def get_consent_status(current_user: dict = Depends(get_current_user)):
    """
    Get current consent settings for the user.
    """
    user_id = current_user["id"]
    
    consent = await db.user_consents.find_one(
        {"user_id": user_id},
        {"_id": 0}
    )
    
    if not consent:
        # Return default consent status
        return {
            "user_id": user_id,
            "consents": {
                "essential_cookies": True,  # Always required
                "analytics": False,
                "marketing_emails": False,
                "ai_processing": True,  # Default for app functionality
            },
            "last_updated": None
        }
    
    return consent


@router.post("/gdpr/consent")
async def update_consent(
    consents: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Update user consent preferences.
    """
    user_id = current_user["id"]
    
    # Validate consent keys
    valid_keys = {"essential_cookies", "analytics", "marketing_emails", "ai_processing"}
    for key in consents.keys():
        if key not in valid_keys:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid consent key: {key}. Valid keys are: {valid_keys}"
            )
    
    # Essential cookies cannot be disabled
    consents["essential_cookies"] = True
    
    consent_doc = {
        "user_id": user_id,
        "consents": consents,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "ip_address": "recorded_separately"  # Don't store IP in this doc
    }
    
    await db.user_consents.update_one(
        {"user_id": user_id},
        {"$set": consent_doc},
        upsert=True
    )
    
    # Log consent change
    await db.security_audit_log.insert_one({
        "event": "consent_updated",
        "user_id": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "new_consents": consents
    })
    
    return {
        "message": "Consent preferences updated",
        "consents": consents
    }
