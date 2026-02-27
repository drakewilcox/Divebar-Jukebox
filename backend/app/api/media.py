"""Media serving endpoints for cover art and other assets"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import logging

from app.config import settings

router = APIRouter(prefix="/api/media", tags=["media"])
logger = logging.getLogger(__name__)


def _serve_from_root(root: Path, file_path: str):
    """Serve a file from root; file_path is relative. Returns FileResponse or raises HTTPException."""
    full_path = root / file_path
    try:
        full_path = full_path.resolve()
        root_resolved = root.resolve()
        if not str(full_path).startswith(str(root_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception as e:
        logger.error("Path resolution error: %s", e)
        raise HTTPException(status_code=400, detail="Invalid path") from e
    if not full_path.exists() or not full_path.is_file():
        logger.warning("Media file not found: %s", full_path)
        raise HTTPException(status_code=404, detail="Media file not found")
    suffix = full_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_types.get(suffix, "application/octet-stream")
    return FileResponse(path=str(full_path), media_type=media_type, filename=full_path.name)


@router.get("/playlist/{file_path:path}")
def serve_playlist_media(file_path: str):
    """Serve media files (e.g. cover.jpg) from the Playlists folder."""
    library_path = Path(settings.resolved_playlists_path)
    return _serve_from_root(library_path, file_path)


@router.get("/{file_path:path}")
def serve_media_file(file_path: str):
    """
    Serve media files (cover art) from the music library.
    file_path: Relative path from music library root.
    """
    library_path = Path(settings.music_library_path)
    return _serve_from_root(library_path, file_path)
