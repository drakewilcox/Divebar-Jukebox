"""Collections API endpoints"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Any
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.services.collection_service import CollectionService

router = APIRouter(prefix="/api/collections", tags=["collections"])


class CollectionResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    is_active: bool
    published: bool = False
    source: str = 'local'
    user_slug: str | None = None
    sections_enabled: bool = False
    sections: List[Any] | None = None
    default_sort_order: str | None = None
    default_show_jump_to_bar: bool | None = None
    default_jump_button_type: str | None = None
    default_show_color_coding: bool | None = None
    default_show_card_background: bool | None = None
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
    spotify_image_url: str | None = None
    year: int | None
    total_tracks: int
    has_multi_disc: bool
    various_artists: bool = False
    is_playlist: bool = False


@router.get("", response_model=List[CollectionResponse])
def list_collections(db: Session = Depends(get_db)):
    """List all active published collections with owner user_slug (excludes the virtual 'all' collection)."""
    from app.models.user import User
    from app.models.collection import Collection
    service = CollectionService(db)
    collections = service.get_all_collections()
    # Attach user_slug by joining with User
    user_ids = {c.user_id for c in collections if c.user_id}
    users = {u.id: u.slug for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    results = []
    for c in collections:
        row = CollectionResponse.model_validate(c)
        row.user_slug = users.get(c.user_id)
        results.append(row)
    return results


@router.get("/{slug}", response_model=CollectionResponse)
def get_collection(
    slug: str,
    user_slug: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Get collection by slug. When user_slug is provided, resolve by (user_slug, slug)."""
    service = CollectionService(db)
    collection = service.get_collection_by_slug(slug, user_id=None) if not user_slug else service.get_collection_by_user_slug_and_collection_slug(user_slug, slug)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


@router.get("/{slug}/albums", response_model=List[AlbumInCollectionResponse])
def get_collection_albums(
    slug: str,
    user_slug: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Get all albums in a collection. When user_slug is provided, resolve collection by (user_slug, slug)."""
    service = CollectionService(db)
    if user_slug:
        collection = service.get_collection_by_user_slug_and_collection_slug(user_slug, slug)
    else:
        collection = service.get_collection_by_slug(slug)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    only_spotify = not settings.enable_local_library
    if slug == "all":
        from app.services.album_service import AlbumService
        album_service = AlbumService(db)
        all_albums = album_service.get_all_albums(limit=10000, user_id=getattr(collection, "user_id", None))
        filtered = [a for a in all_albums if not a.archived]
        if only_spotify:
            filtered = [a for a in filtered if getattr(a, "spotify_id", None)]
        return [
            {
                "id": album.id,
                "display_number": idx + 1,
                "title": album.title,
                "artist": album.artist,
                "cover_art_path": album.custom_cover_art_path or album.cover_art_path,
                "spotify_image_url": getattr(album, "spotify_image_url", None),
                "year": album.year,
                "total_tracks": album.total_tracks,
                "has_multi_disc": album.has_multi_disc,
                "various_artists": getattr(album, "various_artists", False),
                "is_playlist": getattr(album, "is_playlist", False),
            }
            for idx, album in enumerate(filtered)
        ]
    albums = service.get_collection_albums(collection.id, include_tracks=False, only_spotify=only_spotify)
    return albums
