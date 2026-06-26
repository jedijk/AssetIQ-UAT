"""Failure modes library routes — versions service module."""
from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
from database import failure_modes_service

logger = logging.getLogger(__name__)


async def get_failure_mode_versions(mode_id: str, *, current_user: dict):
    """Get version history for a failure mode."""
    try:
        versions = await failure_modes_service.get_versions(mode_id)
        return {"versions": versions, "total": len(versions)}
    except Exception as e:
        logger.error(f"Error getting failure mode versions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RollbackRequest(BaseModel):
    version_id: str
    reason: Optional[str] = None


async def rollback_failure_mode(mode_id: str, data: RollbackRequest, *, current_user: dict):
    """Rollback a failure mode to a specific version."""
    try:
        user_name = current_user.get("name", current_user.get("email", "Unknown"))
        result = await failure_modes_service.rollback_to_version(
            mode_id,
            data.version_id,
            rolled_back_by=user_name,
        )

        if result:
            return {**result, "message": f"Rolled back to version {result.get('rolled_back_from_version', '?')}"}

        raise HTTPException(status_code=404, detail="Version or failure mode not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rolling back failure mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))
