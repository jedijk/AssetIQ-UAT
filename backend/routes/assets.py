"""
Static assets route - serves assets from object storage.
"""
from fastapi import APIRouter, HTTPException, Query, Header
from fastapi.responses import Response
import logging

from services.storage_service import get_object

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Assets"])


@router.get("/storage/{path:path}")
async def serve_storage_file(
    path: str,
    token: str = Query(None),
    authorization: str = Header(None)
):
    """
    Serve a file from object storage.
    
    This endpoint serves files stored in object storage, including:
    - Form submission attachments
    - Task execution attachments
    - User avatars (when stored in object storage)
    - Any other uploaded files
    
    Authentication can be provided via:
    - Authorization: Bearer <token> header
    - ?token=<token> query parameter (for browser image loading)
    """
    # Validate auth
    auth_header = authorization or (f"Bearer {token}" if token else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        # Get the file from storage
        content, content_type = get_object(path)
        
        # Determine filename from path
        filename = path.split('/')[-1] if '/' in path else path
        
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{filename}\"",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to serve file {path}: {e}")
        raise HTTPException(status_code=404, detail="File not found")


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
                "Cache-Control": "public, max-age=86400",
                "Accept-Ranges": "bytes"
            }
        )
    except Exception as e:
        logger.error(f"Failed to get background video: {e}")
        raise HTTPException(status_code=404, detail="Video not found")
