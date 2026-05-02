"""
Ensure the designated account has owner role in the UAT MongoDB database.

UAT requests resolve users from the assetiq-UAT database (see auth._validate_token).
If that user is viewer/admin there while production has owner, owner-only features still fail.
This startup hook is idempotent and safe to run on every deploy.
"""
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)


def _is_uat_target_deployment() -> bool:
    """Only touch UAT user data when this process is configured for UAT."""
    db_name = (os.environ.get("DB_NAME") or "").lower()
    if "uat" in db_name:
        return True
    return os.environ.get("ENSURE_UAT_OWNER", "").lower() == "true"


def _resolve_bootstrap_email() -> Optional[str]:
    explicit = (os.environ.get("PRIMARY_OWNER_EMAIL") or "").strip()
    if explicit:
        return explicit.lower()
    # Default for this project's UAT when DB_NAME targets UAT (override with PRIMARY_OWNER_EMAIL)
    if _is_uat_target_deployment():
        return "jedijk@gmail.com"
    return None


async def ensure_uat_primary_owner(client, available_databases: dict) -> None:
    """
    Promote the bootstrap email to owner in the UAT database collection.
    """
    if not _is_uat_target_deployment():
        return

    email = _resolve_bootstrap_email()
    if not email:
        return

    uat_cfg = available_databases.get("uat") or {}
    uat_name = uat_cfg.get("name")
    if not uat_name:
        return

    uat_db = client[uat_name]
    esc = re.escape(email)
    result = await uat_db.users.update_one(
        {"email": {"$regex": f"^{esc}$", "$options": "i"}},
        {
            "$set": {
                "role": "owner",
                "approval_status": "approved",
                "is_active": True,
            }
        },
    )

    if result.matched_count:
        logger.info(
            "UAT owner role ensured for %s in database %s",
            email,
            uat_name,
        )
    else:
        logger.warning(
            "UAT owner bootstrap: no user matched email %s in %s — register or create the user first",
            email,
            uat_name,
        )
