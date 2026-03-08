"""Albums API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.collection_album import CollectionAlbum
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
    is_favorite: bool
    is_recommended: bool
    file_path: str
    
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
    various_artists: bool = False
    description: str | None = None
    is_playlist: bool = False

    class Config:
        from_attributes = True


class AlbumDetailResponse(AlbumResponse):
    tracks: List[TrackResponse]


MAX_BATCH_ALBUMS = 20


def _filter_tracks_by_collection(
    db: Session,
    collection_service: CollectionService,
    collection: Optional[str],
    user_slug: Optional[str],
    album_id: str,
    tracks: List,
) -> List:
    """Filter tracks by collection enabled_track_ids. Returns filtered list."""
    if not collection or collection == "all":
        return tracks
    if user_slug:
        collection_obj = collection_service.get_collection_by_user_slug_and_collection_slug(user_slug, collection)
    else:
        collection_obj = collection_service.get_collection_by_slug(collection)
    if not collection_obj:
        return tracks
    ca = db.query(CollectionAlbum).filter(
        CollectionAlbum.collection_id == collection_obj.id,
        CollectionAlbum.album_id == album_id,
    ).first()
    if not ca or not ca.enabled_track_ids:
        return tracks
    enabled_ids = set(ca.enabled_track_ids)
    return [t for t in tracks if t.id in enabled_ids]


@router.get("", response_model=List[AlbumDetailResponse])
def get_albums_batch(
    ids: str = Query(..., description="Comma-separated album IDs (max 20)"),
    collection: Optional[str] = Query(None, description="Filter tracks by collection"),
    user_slug: Optional[str] = Query(None, description="Owner user slug (for /:user_slug/:collection_slug)"),
    db: Session = Depends(get_db),
):
    """Get details (with tracks) for multiple albums in one request. Use for prefetching carousel cards."""
    album_ids = [x.strip() for x in ids.split(",") if x.strip()]
    if not album_ids:
        return []
    if len(album_ids) > MAX_BATCH_ALBUMS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_BATCH_ALBUMS} ids allowed")
    album_service = AlbumService(db)
    track_service = TrackService(db)
    collection_service = CollectionService(db) if (collection and collection != "all") else None

    result = []
    for album_id in album_ids:
        album = album_service.get_album_by_id(album_id)
        if not album:
            continue
        tracks = track_service.get_tracks_by_album(album_id)
        if collection_service and collection and collection != "all":
            tracks = _filter_tracks_by_collection(db, collection_service, collection, user_slug, album_id, tracks)
        result.append({
            "id": album.id,
            "title": album.title,
            "artist": album.artist,
            "cover_art_path": album.custom_cover_art_path or album.cover_art_path,
            "year": album.year,
            "total_tracks": album.total_tracks,
            "has_multi_disc": album.has_multi_disc,
            "various_artists": getattr(album, "various_artists", False),
            "description": getattr(album, "description", None),
            "is_playlist": getattr(album, "is_playlist", False),
            "tracks": tracks,
        })
    return result


@router.get("/{album_id}", response_model=AlbumDetailResponse)
def get_album(
    album_id: str,
    collection: Optional[str] = Query(None, description="Filter tracks by collection"),
    user_slug: Optional[str] = Query(None, description="Owner user slug (for /:user_slug/:collection_slug)"),
    db: Session = Depends(get_db)
):
    """Get album details with tracks"""
    album_service = AlbumService(db)
    track_service = TrackService(db)

    album = album_service.get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail=f"Album '{album_id}' not found")

    tracks = track_service.get_tracks_by_album(album_id)
    if collection and collection != "all":
        collection_service = CollectionService(db)
        tracks = _filter_tracks_by_collection(db, collection_service, collection, user_slug, album_id, tracks)

    return {
        "id": album.id,
        "title": album.title,
        "artist": album.artist,
        "cover_art_path": album.custom_cover_art_path or album.cover_art_path,
        "year": album.year,
        "total_tracks": album.total_tracks,
        "has_multi_disc": album.has_multi_disc,
        "various_artists": getattr(album, "various_artists", False),
        "description": getattr(album, "description", None),
        "is_playlist": getattr(album, "is_playlist", False),
        "tracks": tracks
    }


@router.get("/{album_id}/tracks", response_model=List[TrackResponse])
def get_album_tracks(album_id: str, db: Session = Depends(get_db)):
    """Get tracks for an album"""
    track_service = TrackService(db)
    tracks = track_service.get_tracks_by_album(album_id)
    return tracks
