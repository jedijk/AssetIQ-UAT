"""
Static assets route - serves assets from object storage.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import logging

from services.storage_service import get_object

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Assets"])


@router.get("/assets/video/background.mp4")
async def get_background_video():
    """
    Serve the background video from object storage.
    This is a public endpoint - no auth required.
    """
    try:
        content, content_type = get_object("assetiq/videos/background.mp4")
        return Response(
            content=content,
            media_type="video/mp4",
            headers={
                "Cache-Control": "public, max-age=86400",  # Cache for 1 day
                "Accept-Ranges": "bytes"
            }
        )
    except Exception as e:
        logger.error(f"Failed to get background video: {e}")
        raise HTTPException(status_code=404, detail="Video not found")
