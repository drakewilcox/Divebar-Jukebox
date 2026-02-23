"""Collections API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
from pydantic import BaseModel

from app.database import get_db
from app.services.collection_service import CollectionService

router = APIRouter(prefix="/api/collections", tags=["collections"])


class CollectionResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    is_active: bool
    sections_enabled: bool = False
    sections: List[Any] | None = None
    default_sort_order: str | None = None
    default_show_jump_to_bar: bool | None = None
    default_jump_button_type: str | None = None
    default_show_color_coding: bool | None = None
    default_edit_mode: bool | None = None
    default_crossfade_seconds: int | None = None
    default_hit_button_mode: str | None = None

    class Config:
        from_attributes = True


class AlbumInCollectionResponse(BaseModel):
    id: str
    display_number: int
    title: str
    artist: str
    cover_art_path: str | None
    year: int | None
    total_tracks: int
    has_multi_disc: bool


@router.get("", response_model=List[CollectionResponse])
def list_collections(db: Session = Depends(get_db)):
    """List all active collections (includes special 'all' collection)"""
    service = CollectionService(db)
    collections = service.get_all_collections()
    
    # Update "all" collection description with current album count (excluding archived)
    for collection in collections:
        if collection.slug == 'all':
            from app.services.album_service import AlbumService
            album_service = AlbumService(db)
            all_albums = album_service.get_all_albums(limit=10000)
            total_albums = len([a for a in all_albums if not a.archived])
            collection.description = f"All albums in the database ({total_albums} albums)"
    
    return collections


@router.get("/{slug}", response_model=CollectionResponse)
def get_collection(slug: str, db: Session = Depends(get_db)):
    """Get collection by slug"""
    service = CollectionService(db)
    collection = service.get_collection_by_slug(slug)
    
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{slug}' not found")
    
    return collection


@router.get("/{slug}/albums", response_model=List[AlbumInCollectionResponse])
def get_collection_albums(slug: str, db: Session = Depends(get_db)):
    """Get all albums in a collection with display numbers"""
    # Handle special "all" collection
    if slug == "all":
        from app.services.album_service import AlbumService
        album_service = AlbumService(db)
        all_albums = album_service.get_all_albums(limit=10000)
        
        # Filter out archived albums and format for response
        return [
            {
                "id": album.id,
                "display_number": idx + 1,
                "title": album.title,
                "artist": album.artist,
                "cover_art_path": album.cover_art_path,
                "year": album.year,
                "total_tracks": album.total_tracks,
                "has_multi_disc": album.has_multi_disc,
            }
            for idx, album in enumerate([a for a in all_albums if not a.archived])
        ]
    
    service = CollectionService(db)
    collection = service.get_collection_by_slug(slug)
    
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{slug}' not found")
    
    albums = service.get_collection_albums(collection.id, include_tracks=False)
    return albums
