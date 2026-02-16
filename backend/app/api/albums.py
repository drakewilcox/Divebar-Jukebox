"""Albums API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.services.album_service import AlbumService
from app.services.track_service import TrackService
from app.services.collection_service import CollectionService

router = APIRouter(prefix="/api/albums", tags=["albums"])


class TrackResponse(BaseModel):
    id: str
    disc_number: int
    track_number: int
    title: str
    artist: str
    duration_ms: int
    enabled: bool
    
    class Config:
        from_attributes = True


class AlbumResponse(BaseModel):
    id: str
    title: str
    artist: str
    cover_art_path: str | None
    year: int | None
    total_tracks: int
    has_multi_disc: bool
    
    class Config:
        from_attributes = True


class AlbumDetailResponse(AlbumResponse):
    tracks: List[TrackResponse]


@router.get("/{album_id}", response_model=AlbumDetailResponse)
def get_album(
    album_id: str,
    collection: Optional[str] = Query(None, description="Filter tracks by collection"),
    db: Session = Depends(get_db)
):
    """Get album details with tracks"""
    album_service = AlbumService(db)
    track_service = TrackService(db)
    
    album = album_service.get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail=f"Album '{album_id}' not found")
    
    # Get tracks
    tracks = track_service.get_tracks_by_album(album_id)
    
    # If collection is specified, filter by enabled tracks (except for "all" collection)
    if collection and collection != 'all':
        collection_service = CollectionService(db)
        collection_obj = collection_service.get_collection_by_slug(collection)
        
        if collection_obj:
            # Get collection albums to find enabled tracks
            albums_data = collection_service.get_collection_albums(collection_obj.id, include_tracks=True)
            album_data = next((a for a in albums_data if a['id'] == album_id), None)
            
            if album_data and 'tracks' in album_data:
                enabled_track_ids = {t['id'] for t in album_data['tracks']}
                tracks = [t for t in tracks if t.id in enabled_track_ids]
    
    return {
        "id": album.id,
        "title": album.title,
        "artist": album.artist,
        "cover_art_path": album.cover_art_path,
        "year": album.year,
        "total_tracks": album.total_tracks,
        "has_multi_disc": album.has_multi_disc,
        "tracks": tracks
    }


@router.get("/{album_id}/tracks", response_model=List[TrackResponse])
def get_album_tracks(album_id: str, db: Session = Depends(get_db)):
    """Get tracks for an album"""
    track_service = TrackService(db)
    tracks = track_service.get_tracks_by_album(album_id)
    return tracks
