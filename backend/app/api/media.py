"""Media serving endpoints for cover art and other assets"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import logging

from app.config import settings

router = APIRouter(prefix="/api/media", tags=["media"])
logger = logging.getLogger(__name__)


@router.get("/{file_path:path}")
def serve_media_file(file_path: str):
    """
    Serve media files (cover art) from the music library
    
    Args:
        file_path: Relative path from music library root
    """
    # Construct full path
    library_path = Path(settings.music_library_path)
    full_path = library_path / file_path
    
    # Security: Ensure the resolved path is within the library directory
    try:
        full_path = full_path.resolve()
        library_path = library_path.resolve()
        
        if not str(full_path).startswith(str(library_path)):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception as e:
        logger.error(f"Path resolution error: {e}")
        raise HTTPException(status_code=400, detail="Invalid path")
    
    # Check if file exists
    if not full_path.exists() or not full_path.is_file():
        logger.warning(f"Media file not found: {full_path}")
        raise HTTPException(status_code=404, detail="Media file not found")
    
    # Determine media type
    suffix = full_path.suffix.lower()
    media_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    }
    
    media_type = media_types.get(suffix, 'application/octet-stream')
    
    return FileResponse(
        path=str(full_path),
        media_type=media_type,
        filename=full_path.name
    )
