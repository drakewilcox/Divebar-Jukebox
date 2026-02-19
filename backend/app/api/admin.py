"""Admin API endpoints"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import logging

from app.database import get_db
from app.services.album_service import AlbumService
from app.services.collection_service import CollectionService
from app.models.album import Album
from app.models.track import Track

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)


class ScanResultResponse(BaseModel):
    albums_found: int
    albums_imported: int
    albums_updated: int
    albums_already_exist: int
    albums_skipped: int
    tracks_imported: int
    errors: List[str]


class AlbumListResponse(BaseModel):
    id: str
    title: str
    artist: str
    file_path: str
    cover_art_path: str | None
    total_tracks: int
    year: int | None
    archived: bool
    created_at: datetime | None

    class Config:
        from_attributes = True


class UpdateAlbumRequest(BaseModel):
    title: str | None = None
    artist: str | None = None
    year: int | None = None
    archived: bool | None = None


class UpdateTrackRequest(BaseModel):
    title: str | None = None
    enabled: bool | None = None
    is_favorite: bool | None = None
    is_recommended: bool | None = None


class CreateCollectionRequest(BaseModel):
    name: str
    slug: str
    description: str | None = None


class UpdateCollectionRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    is_active: bool | None = None


class SectionItem(BaseModel):
    order: int
    name: str
    color: str
    start_slot: int | None = None  # 1-based first slot in this section
    end_slot: int | None = None    # 1-based last slot in this section


class UpdateCollectionSectionsRequest(BaseModel):
    sections_enabled: bool
    sections: List[SectionItem] | None = None


def run_library_scan(db: Session):
    """Background task to scan library"""
    album_service = AlbumService(db)
    results = album_service.scan_and_import_library()
    return results


@router.post("/library/scan", response_model=ScanResultResponse)
def scan_library(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Trigger a library scan to import new albums (existing albums by file_path are skipped, not updated)."""
    album_service = AlbumService(db)
    
    # Run scan synchronously (could be moved to background for large libraries)
    results = album_service.scan_and_import_library()
    
    return results


@router.get("/library/albums", response_model=List[AlbumListResponse])
def list_all_albums(
    limit: int = 1000,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List all albums in the database"""
    album_service = AlbumService(db)
    albums = album_service.get_all_albums(limit=limit, offset=offset)
    return albums


@router.put("/albums/{album_id}")
def update_album(album_id: str, request: UpdateAlbumRequest, db: Session = Depends(get_db)):
    """Update album metadata"""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail=f"Album '{album_id}' not found")
    
    # Update provided fields
    if request.title is not None:
        album.title = request.title
    if request.artist is not None:
        album.artist = request.artist
    if request.year is not None:
        album.year = request.year
    if request.archived is not None:
        album.archived = request.archived
    
    db.commit()
    return {"message": "Album updated", "id": album.id}


@router.get("/albums/{album_id}")
def get_album_details(album_id: str, db: Session = Depends(get_db)):
    """Get album details with tracks and collections"""
    from app.models.collection_album import CollectionAlbum
    from app.models.collection import Collection
    
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail=f"Album '{album_id}' not found")
    
    # Get tracks
    tracks = [{
        "id": track.id,
        "track_number": track.track_number,
        "disc_number": track.disc_number,
        "title": track.title,
        "artist": track.artist,
        "duration_ms": track.duration_ms,
        "enabled": track.enabled,
        "is_favorite": track.is_favorite,
        "is_recommended": track.is_recommended,
        "file_path": track.file_path
    } for track in sorted(album.tracks, key=lambda t: (t.disc_number, t.track_number))]
    
    # Get collections this album is in
    collection_albums = db.query(CollectionAlbum).filter(
        CollectionAlbum.album_id == album_id
    ).all()
    collection_ids = [ca.collection_id for ca in collection_albums]
    
    # Genre from extra_metadata (set during library scan; may be missing for older imports)
    extra = album.extra_metadata or {}
    genre = extra.get("genre")
    if isinstance(genre, list):
        genre_list = [str(g) for g in genre if g]
    elif genre:
        genre_list = [str(genre)]
    else:
        genre_list = []

    return {
        "id": album.id,
        "title": album.title,
        "artist": album.artist,
        "year": album.year,
        "cover_art_path": album.cover_art_path,
        "custom_cover_art_path": album.custom_cover_art_path,
        "archived": album.archived,
        "genre": genre_list,
        "tracks": tracks,
        "collection_ids": collection_ids
    }


@router.put("/tracks/{track_id}")
def update_track(track_id: str, request: UpdateTrackRequest, db: Session = Depends(get_db)):
    """Update track metadata"""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
    
    if request.title is not None:
        track.title = request.title
    if request.enabled is not None:
        track.enabled = request.enabled
    if request.is_favorite is not None:
        track.is_favorite = request.is_favorite
    if request.is_recommended is not None:
        track.is_recommended = request.is_recommended
    
    db.commit()
    return {"message": "Track updated", "id": track.id}


@router.delete("/albums/{album_id}")
def delete_album(album_id: str, db: Session = Depends(get_db)):
    """Delete an album from the database"""
    album_service = AlbumService(db)
    
    if not album_service.delete_album(album_id):
        raise HTTPException(status_code=404, detail=f"Album '{album_id}' not found")
    
    return {"message": "Album deleted"}


@router.post("/collections")
def create_collection(request: CreateCollectionRequest, db: Session = Depends(get_db)):
    """Create a new collection"""
    collection_service = CollectionService(db)
    
    try:
        collection = collection_service.create_collection(
            name=request.name,
            slug=request.slug,
            description=request.description
        )
        return {
            "id": collection.id,
            "name": collection.name,
            "slug": collection.slug,
            "description": collection.description
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/collections/{collection_id}")
def update_collection(
    collection_id: str,
    request: UpdateCollectionRequest,
    db: Session = Depends(get_db)
):
    """Update a collection"""
    collection_service = CollectionService(db)
    try:
        collection = collection_service.update_collection(
            collection_id=collection_id,
            name=request.name,
            slug=request.slug,
            description=request.description,
            is_active=request.is_active
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    return {"message": "Collection updated"}


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, db: Session = Depends(get_db)):
    """Delete a collection"""
    # Prevent deletion of special "all" collection
    if collection_id == '00000000-0000-0000-0000-000000000000':
        raise HTTPException(status_code=400, detail="Cannot delete the special 'All Albums' collection")
    
    collection_service = CollectionService(db)
    
    if not collection_service.delete_collection(collection_id):
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    
    return {"message": "Collection deleted"}


@router.put("/collections/{collection_id}/sections")
def update_collection_sections(
    collection_id: str,
    body: UpdateCollectionSectionsRequest,
    db: Session = Depends(get_db),
):
    """Enable/disable sections and set section list (3-10 when enabled)."""
    collection_service = CollectionService(db)
    sections_dict = [s.model_dump() for s in body.sections] if body.sections else None
    try:
        collection = collection_service.update_collection_sections(
            collection_id, body.sections_enabled, sections_dict
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    return {"message": "Sections updated"}


@router.put("/collections/{slug}/albums")
def update_collection_albums(
    slug: str,
    album_id: str,
    action: str,  # 'add' or 'remove'
    sort_order: int = None,
    db: Session = Depends(get_db)
):
    """Add or remove an album from a collection"""
    collection_service = CollectionService(db)
    
    collection = collection_service.get_collection_by_slug(slug)
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{slug}' not found")
    
    if action == 'add':
        result = collection_service.add_album_to_collection(collection.id, album_id, sort_order)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to add album to collection")
        return {"message": "Album added to collection"}
    
    elif action == 'remove':
        if not collection_service.remove_album_from_collection(collection.id, album_id):
            raise HTTPException(status_code=404, detail="Album not found in collection")
        return {"message": "Album removed from collection"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'add' or 'remove'")


@router.put("/collections/{slug}/albums/reorder")
def reorder_collection_albums(
    slug: str,
    album_id: str,
    new_sort_order: int,
    db: Session = Depends(get_db)
):
    """Update sort order for an album in a collection"""
    collection_service = CollectionService(db)
    
    collection = collection_service.get_collection_by_slug(slug)
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{slug}' not found")
    
    if not collection_service.update_album_sort_order(collection.id, album_id, new_sort_order):
        raise HTTPException(status_code=404, detail="Album not found in collection")
    
    return {"message": "Album reordered"}


class SetCollectionOrderRequest(BaseModel):
    album_ids: List[str]


@router.put("/collections/{slug}/albums/order")
def set_collection_album_order(
    slug: str,
    body: SetCollectionOrderRequest,
    db: Session = Depends(get_db)
):
    """Set full order of albums in a collection (list of album IDs in desired order)."""
    collection_service = CollectionService(db)
    
    collection = collection_service.get_collection_by_slug(slug)
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{slug}' not found")
    
    if not collection_service.set_collection_album_order(collection.id, body.album_ids):
        raise HTTPException(
            status_code=400,
            detail="Invalid album_ids: must match exactly the albums in the collection (no duplicates, no unknowns)"
        )
    
    return {"message": "Collection order saved"}


@router.post("/sanitize-tracks")
def sanitize_all_track_titles(db: Session = Depends(get_db)):
    """
    Sanitize all track titles in the database by removing remaster annotations
    
    This will update track titles in place to remove parentheses containing
    'remaster' or 'remastered' text.
    """
    from app.utils.metadata_extractor import sanitize_track_title
    
    # Get all tracks
    tracks = db.query(Track).all()
    updated_count = 0
    
    for track in tracks:
        original_title = track.title
        sanitized_title = sanitize_track_title(original_title)
        
        if sanitized_title != original_title:
            track.title = sanitized_title
            updated_count += 1
            logger.info(f"Sanitized: '{original_title}' -> '{sanitized_title}'")
    
    db.commit()
    
    return {
        "message": f"Sanitized {updated_count} track titles",
        "total_tracks": len(tracks),
        "updated_count": updated_count
    }
