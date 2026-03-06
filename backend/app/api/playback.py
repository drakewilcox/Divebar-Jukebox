"""Playback API endpoints"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db

logger = logging.getLogger(__name__)
from app.services.playback_service import PlaybackService
from app.services.collection_service import CollectionService
from app.services.track_service import TrackService
from app.services.album_service import AlbumService

router = APIRouter(prefix="/api/playback", tags=["playback"])


def _resolve_collection_id(collection_service: CollectionService, collection: str, user_slug: Optional[str]) -> str:
    if user_slug:
        obj = collection_service.get_collection_by_user_slug_and_collection_slug(user_slug, collection)
        if not obj:
            raise HTTPException(status_code=404, detail="Collection not found")
        return obj.id
    if collection == "all":
        return "00000000-0000-0000-0000-000000000000"
    obj = collection_service.get_collection_by_slug(collection)
    if not obj:
        raise HTTPException(status_code=404, detail="Collection not found")
    return obj.id


class PlaybackStateResponse(BaseModel):
    collection_id: str
    current_track_id: str | None
    is_playing: bool
    current_position_ms: int
    volume: int
    current_track: dict | None = None


class PlaybackControlRequest(BaseModel):
    collection: str
    user_slug: Optional[str] = None


class UpdatePositionRequest(BaseModel):
    collection: str
    user_slug: Optional[str] = None
    position_ms: int


class SetVolumeRequest(BaseModel):
    collection: str
    user_slug: Optional[str] = None
    volume: int


def _safe_float(value, default=None):
    """Parse float safely; return default on failure."""
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _str_or_none(x):
    """Return None if x is None, else str(x) (for JSON-safe IDs/URLs)."""
    return None if x is None else str(x)


def _safe_selection_display(sel: tuple) -> str | None:
    """Format (album_display_number, track_number_1based) for display; return None if invalid."""
    if not sel or len(sel) < 2:
        return None
    try:
        a, b = int(sel[0]), int(sel[1])
        return f"{a:03d}-{b:02d}"
    except (TypeError, ValueError):
        return None


@router.get("/state", response_model=PlaybackStateResponse)
def get_playback_state(
    collection: str = Query(..., description="Collection slug"),
    user_slug: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Get current playback state for a collection"""
    try:
        collection_service = CollectionService(db)
        playback_service = PlaybackService(db)
        track_service = TrackService(db)
        album_service = AlbumService(db)
        collection_id = _resolve_collection_id(collection_service, collection, user_slug)
        state = playback_service.get_or_create_playback_state(collection_id)
        cid = str(state.collection_id) if state.collection_id is not None else collection_id

        # Current track display: use only database-saved values (track/album rows), not file metadata
        current_track_info = None
        if state.current_track_id:
            track = track_service.get_track_by_id(state.current_track_id)
            if track:
                album = getattr(track, "album", None)
                if album is not None:
                    try:
                        cover = album.custom_cover_art_path or album.cover_art_path
                        selection_display = None
                        track_number_1based = None
                        if cid == '00000000-0000-0000-0000-000000000000':
                            all_albums = album_service.get_all_albums(limit=10000)
                            for idx, a in enumerate(all_albums):
                                if a.id == album.id:
                                    tracks = track_service.get_tracks_by_album(album.id)
                                    for ti, t in enumerate(tracks):
                                        if t.id == track.id:
                                            track_number_1based = ti + 1
                                            selection_display = f"{(idx + 1):03d}-{(ti + 1):02d}"
                                            break
                                    break
                        else:
                            sel = collection_service.get_selection_for_track(cid, str(track.id))
                            if sel:
                                try:
                                    track_number_1based = int(sel[1])
                                except (TypeError, ValueError):
                                    track_number_1based = None
                                selection_display = _safe_selection_display(sel)
                        extra = getattr(track, "extra_metadata", None) or {}
                        replaygain_db = _safe_float(extra.get("replaygain_track_gain")) or _safe_float(extra.get("replaygain_album_gain"))
                        year_val = getattr(album, "year", None)
                        if year_val is not None:
                            try:
                                year_val = int(year_val)
                            except (TypeError, ValueError):
                                year_val = None
                        current_track_info = {
                            "id": str(track.id),
                            "title": str(track.title) if getattr(track, "title", None) is not None else "",
                            "artist": str(track.artist) if getattr(track, "artist", None) is not None else "",
                            "duration_ms": int(track.duration_ms) if getattr(track, "duration_ms", None) is not None else 0,
                            "album_title": str(album.title) if getattr(album, "title", None) is not None else "",
                            "album_artist": str(album.artist) if getattr(album, "artist", None) is not None else "",
                            "album_year": year_val,
                            "cover_art_path": _str_or_none(cover),
                            "spotify_image_url": _str_or_none(getattr(album, "spotify_image_url", None)),
                            "is_playlist": bool(getattr(album, "is_playlist", False)),
                            "selection_display": str(selection_display) if selection_display is not None else None,
                            "album_id": str(album.id),
                            "track_number": int(track_number_1based) if track_number_1based is not None else None,
                            "replaygain_track_gain": float(replaygain_db) if replaygain_db is not None else None,
                            "spotify_id": _str_or_none(getattr(track, "spotify_id", None)),
                        }
                    except Exception as build_err:
                        logger.warning("Building current_track_info failed: %s", build_err, exc_info=True)
                        current_track_info = None

        return {
            "collection_id": str(cid),
            "current_track_id": str(state.current_track_id) if state.current_track_id else None,
            "is_playing": bool(state.is_playing),
            "current_position_ms": int(state.current_position_ms) if state.current_position_ms is not None else 0,
            "volume": int(state.volume) if state.volume is not None else 70,
            "current_track": current_track_info
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_playback_state failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/play")
def play(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Start or resume playback"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    state = playback_service.play(collection_id)
    return {"message": "Playback started", "is_playing": state.is_playing if state else False}


@router.post("/pause")
def pause(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Pause playback"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    playback_service.pause(collection_id)
    return {"message": "Playback paused"}


@router.post("/stop")
def stop(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Stop playback"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    playback_service.stop(collection_id)
    return {"message": "Playback stopped"}


@router.post("/skip")
def skip(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Skip to next track"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    state = playback_service.skip(collection_id)
    return {"message": "Skipped to next track", "current_track_id": state.current_track_id if state else None}


@router.post("/position")
def update_position(request: UpdatePositionRequest, db: Session = Depends(get_db)):
    """Update current playback position"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    state = playback_service.update_position(collection_id, request.position_ms)
    return {"message": "Position updated", "position_ms": state.current_position_ms if state else 0}


@router.post("/volume")
def set_volume(request: SetVolumeRequest, db: Session = Depends(get_db)):
    """Set playback volume"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    state = playback_service.set_volume(collection_id, request.volume)
    return {"message": "Volume updated", "volume": state.volume if state else 70}


class NextTransitionResponse(BaseModel):
    next_track_id: str | None
    next_replaygain_db: float | None
    apply_crossfade: bool


@router.get("/next-transition", response_model=NextTransitionResponse)
def get_next_transition(
    collection: str = Query(..., description="Collection slug"),
    user_slug: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Get next track id, replaygain, and whether to apply crossfade (false when next is consecutive on same album)."""
    playback_service = PlaybackService(db)
    collection_service = CollectionService(db)
    collection_id = _resolve_collection_id(collection_service, collection, user_slug)
    next_id, replaygain, apply_crossfade = playback_service.get_next_transition(collection_id)
    return NextTransitionResponse(
        next_track_id=next_id,
        next_replaygain_db=replaygain,
        apply_crossfade=apply_crossfade,
    )


@router.get("/stream/{track_id}")
def stream_track(track_id: str, db: Session = Depends(get_db)):
    """Stream an audio file (FLAC or MP3)."""
    track_service = TrackService(db)
    file_path = track_service.get_track_file_path(track_id)
    if not file_path:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found or file does not exist")
    suffix = file_path.suffix.lower()
    media_type = "audio/mpeg" if suffix == ".mp3" else "audio/flac"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )
