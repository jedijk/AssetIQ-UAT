"""
Static assets route - serves assets from MongoDB storage.
"""
from fastapi import APIRouter, HTTPException, Query, Header
from fastapi.responses import Response
import logging

from services.storage_service import get_object_async, is_storage_available

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Assets"])


@router.get("/storage/{path:path}")
async def serve_storage_file(
    path: str,
    token: str = Query(None),
    authorization: str = Header(None)
):
    """
    Serve a file from MongoDB storage.
    
    This endpoint serves files stored in MongoDB, including:
    - Form submission attachments
    - Task execution attachments
    - User avatars
    - Any other uploaded files
    
    Authentication can be provided via:
    - Authorization: Bearer <token> header
    - ?token=<token> query parameter (for browser image loading)
    """
    # Check if storage is available
    if not is_storage_available():
        logger.error("MongoDB storage not initialized")
        raise HTTPException(
            status_code=503, 
            detail="Storage service not available"
        )
    
    # Validate auth
    auth_header = authorization or (f"Bearer {token}" if token else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    
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
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type"
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
