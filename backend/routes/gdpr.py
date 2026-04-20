"""
GDPR Compliance Routes
Implements:
- Article 15: Right to Access (data export)
- Article 17: Right to Erasure (account deletion)
- Article 20: Data Portability (machine-readable export)
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["GDPR"])


class AccountDeletionRequest(BaseModel):
    """Request body for account deletion confirmation."""
    confirm_email: str
    reason: str = ""


class DataExportRequest(BaseModel):
    """Request body for data export options."""
    format: str = "json"  # json or csv
    include_activity: bool = True
    include_submissions: bool = True
    include_audit_logs: bool = True


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
# Article 17: Right to Erasure (Right to be Forgotten)
# =============================================================================

@router.post("/gdpr/delete-account")
async def request_account_deletion(
    request: AccountDeletionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Request deletion of own account (GDPR Article 17 - Right to Erasure).
    
    This will:
    1. Anonymize user data in related records (for audit trail integrity)
    2. Delete personal profile data
    3. Log the deletion request for compliance
    
    Note: Some data may be retained in anonymized form for legal/audit requirements.
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
    
    logger.info(f"GDPR account deletion requested by user {user_id} ({user_email})")
    
    anonymized_name = "Deleted User"
    anonymized_email = f"deleted_{user_id[:8]}@anonymized.local"
    deletion_timestamp = datetime.now(timezone.utc).isoformat()
    
    try:
        # 1. Anonymize form submissions (keep data, remove PII)
        await db.form_submissions.update_many(
            {"submitted_by": user_id},
            {"$set": {
                "submitted_by_name": anonymized_name,
                "submitted_by_anonymized": True,
                "anonymized_at": deletion_timestamp
            }}
        )
        
        # 2. Anonymize observations
        await db.threats.update_many(
            {"created_by": user_id},
            {"$set": {
                "creator_name": anonymized_name,
                "anonymized": True,
                "anonymized_at": deletion_timestamp
            }}
        )
        
        # 3. Anonymize actions (reassign to system)
        await db.central_actions.update_many(
            {"created_by": user_id},
            {"$set": {
                "creator_name": anonymized_name,
                "anonymized": True
            }}
        )
        await db.central_actions.update_many(
            {"assigned_to": user_id},
            {"$set": {
                "assigned_to": None,
                "assigned_to_name": "Unassigned (User Deleted)"
            }}
        )
        
        # 4. Anonymize investigations
        await db.investigations.update_many(
            {"$or": [{"created_by": user_id}, {"lead_id": user_id}]},
            {"$set": {
                "lead_name": anonymized_name,
                "anonymized": True
            }}
        )
        
        # 5. Delete user chat history
        await db.chat_messages.delete_many({"user_id": user_id})
        await db.chat_conversations.delete_many({"user_id": user_id})
        
        # 6. Delete user statistics
        await db.user_stats.delete_many({"user_id": user_id})
        
        # 7. Delete password reset tokens
        await db.password_resets.delete_many({"email": user_email})
        
        # 8. Delete login attempts
        await db.login_attempts.delete_many({"email": user_email.lower()})
        
        # 9. Delete user preferences
        await db.user_preferences.delete_many({"user_id": user_id})
        
        # 10. Delete avatar data
        await db.users.update_one(
            {"id": user_id},
            {"$unset": {"avatar_data": "", "avatar_path": "", "avatar_content_type": ""}}
        )
        
        # 11. Log the deletion for compliance BEFORE deleting the user
        await db.gdpr_deletion_log.insert_one({
            "event": "account_deletion",
            "original_user_id": user_id,
            "anonymized_email": anonymized_email,
            "deletion_reason": request.reason,
            "timestamp": deletion_timestamp,
            "data_anonymized": True,
            "collections_affected": [
                "form_submissions",
                "threats",
                "central_actions",
                "investigations",
                "chat_messages",
                "chat_conversations",
                "user_stats",
                "password_resets",
                "login_attempts"
            ]
        })
        
        # 12. Finally, delete the user record
        result = await db.users.delete_one({"id": user_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=500, detail="Failed to delete user account")
        
        logger.info(f"GDPR account deletion completed for user {user_id}")
        
        return {
            "message": "Your account has been successfully deleted",
            "details": {
                "account_deleted": True,
                "data_anonymized": True,
                "deletion_timestamp": deletion_timestamp,
                "gdpr_article": "Article 17 - Right to Erasure"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GDPR account deletion failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Account deletion failed. Please contact support."
        )


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
