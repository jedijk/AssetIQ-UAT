"""
Static assets route - serves assets from MongoDB storage.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import Response
import logging

from services.storage_service import get_object_async, is_storage_available
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Assets"])


@router.get("/storage/{path:path}")
async def serve_storage_file(
    request: Request,
    path: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Serve a file from MongoDB storage.
    
    This endpoint serves files stored in MongoDB, including:
    - Form submission attachments
    - Task execution attachments
    - User avatars
    - Any other uploaded files
    
    Authentication is enforced via the shared `get_current_user` dependency:
    - Bearer token (Authorization header) OR
    - HttpOnly cookie session (when enabled)
    - Optional query token ONLY if `ALLOW_QUERY_TOKEN_AUTH=true`
    """
    # Check if storage is available
    if not is_storage_available():
        logger.error("MongoDB storage not initialized")
        raise HTTPException(
            status_code=503, 
            detail="Storage service not available"
        )

    try:
        # Get the file from MongoDB storage
        content, content_type = await get_object_async(path)
        
        # Determine filename from path
        filename = path.split('/')[-1] if '/' in path else path
        
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{filename}\"",
                # Files are auth-gated; avoid shared/public caching.
                "Cache-Control": "private, max-age=3600",
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    except Exception as e:
        logger.error(f"Failed to serve file {path}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve file")


@router.get("/assets/video/background.mp4")
async def get_background_video():
    """
    Serve the background video from storage.
    This is a public endpoint - no auth required.
    """
    try:
        content, content_type = await get_object_async("assetiq/videos/background.mp4")
        return Response(
            content=content,
            media_type="video/mp4",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Accept-Ranges": "bytes"
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Video not found")
    except Exception as e:
        logger.error(f"Failed to get background video: {e}")
        raise HTTPException(status_code=404, detail="Video not found")
