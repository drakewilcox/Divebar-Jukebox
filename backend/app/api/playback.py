"""Playback API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.services.playback_service import PlaybackService
from app.services.collection_service import CollectionService
from app.services.track_service import TrackService

router = APIRouter(prefix="/api/playback", tags=["playback"])


class PlaybackStateResponse(BaseModel):
    collection_id: str
    current_track_id: str | None
    is_playing: bool
    current_position_ms: int
    volume: int
    current_track: dict | None = None


class PlaybackControlRequest(BaseModel):
    collection: str


class UpdatePositionRequest(BaseModel):
    collection: str
    position_ms: int


class SetVolumeRequest(BaseModel):
    collection: str
    volume: int


@router.get("/state", response_model=PlaybackStateResponse)
def get_playback_state(collection: str = Query(..., description="Collection slug"), db: Session = Depends(get_db)):
    """Get current playback state for a collection"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    track_service = TrackService(db)
    
    # Handle "all" collection
    if collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        state = playback_service.get_or_create_playback_state(all_collection_id)
    else:
        collection_obj = collection_service.get_collection_by_slug(collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
        
        state = playback_service.get_or_create_playback_state(collection_obj.id)
    
    # Get current track info if playing
    current_track_info = None
    if state.current_track_id:
        track = track_service.get_track_by_id(state.current_track_id)
        if track and track.album:
            current_track_info = {
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "duration_ms": track.duration_ms,
                "album_title": track.album.title,
                "album_artist": track.album.artist,
                "album_year": track.album.year,
                "cover_art_path": track.album.cover_art_path
            }
    
    return {
        "collection_id": state.collection_id,
        "current_track_id": state.current_track_id,
        "is_playing": state.is_playing,
        "current_position_ms": state.current_position_ms,
        "volume": state.volume,
        "current_track": current_track_info
    }


@router.post("/play")
def play(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Start or resume playback"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    
    # Handle "all" collection
    if request.collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        state = playback_service.play(all_collection_id)
    else:
        collection_obj = collection_service.get_collection_by_slug(request.collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
        
        state = playback_service.play(collection_obj.id)
    
    return {"message": "Playback started", "is_playing": state.is_playing if state else False}


@router.post("/pause")
def pause(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Pause playback"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    
    # Handle "all" collection
    if request.collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        state = playback_service.pause(all_collection_id)
    else:
        collection_obj = collection_service.get_collection_by_slug(request.collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
        
        state = playback_service.pause(collection_obj.id)
    
    return {"message": "Playback paused"}


@router.post("/stop")
def stop(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Stop playback"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    
    collection_obj = collection_service.get_collection_by_slug(request.collection)
    if not collection_obj:
        raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
    
    state = playback_service.stop(collection_obj.id)
    return {"message": "Playback stopped"}


@router.post("/skip")
def skip(request: PlaybackControlRequest, db: Session = Depends(get_db)):
    """Skip to next track"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    
    # Handle "all" collection
    if request.collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        state = playback_service.skip(all_collection_id)
    else:
        collection_obj = collection_service.get_collection_by_slug(request.collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
        
        state = playback_service.skip(collection_obj.id)
    
    return {"message": "Skipped to next track", "current_track_id": state.current_track_id if state else None}


@router.post("/position")
def update_position(request: UpdatePositionRequest, db: Session = Depends(get_db)):
    """Update current playback position"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    
    # Handle "all" collection
    if request.collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        state = playback_service.update_position(all_collection_id, request.position_ms)
    else:
        collection_obj = collection_service.get_collection_by_slug(request.collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
        
        state = playback_service.update_position(collection_obj.id, request.position_ms)
    
    return {"message": "Position updated", "position_ms": state.current_position_ms if state else 0}


@router.post("/volume")
def set_volume(request: SetVolumeRequest, db: Session = Depends(get_db)):
    """Set playback volume"""
    collection_service = CollectionService(db)
    playback_service = PlaybackService(db)
    
    # Handle "all" collection
    if request.collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        state = playback_service.set_volume(all_collection_id, request.volume)
    else:
        collection_obj = collection_service.get_collection_by_slug(request.collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
        
        state = playback_service.set_volume(collection_obj.id, request.volume)
    
    return {"message": "Volume updated", "volume": state.volume if state else 70}


@router.get("/stream/{track_id}")
def stream_track(track_id: str, db: Session = Depends(get_db)):
    """Stream a FLAC file"""
    track_service = TrackService(db)
    
    file_path = track_service.get_track_file_path(track_id)
    if not file_path:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found or file does not exist")
    
    return FileResponse(
        path=str(file_path),
        media_type="audio/flac",
        filename=file_path.name
    )
