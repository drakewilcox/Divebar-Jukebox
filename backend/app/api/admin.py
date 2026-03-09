"""Admin API endpoints (all require authenticated user)."""
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import logging
import time

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.album import Album
from app.models.track import Track
from app.models.user import User
from app.services.album_service import AlbumService
from app.services.collection_service import CollectionService
from app.services.spotify_admin_service import (
    exchange_code_and_store,
    get_access_token,
    _refresh_token,
    is_connected,
    fetch_saved_albums,
    fetch_all_saved_album_ids,
    fetch_albums_batch,
    create_or_update_album_from_spotify,
    parse_spotify_url,
    fetch_playlist,
    fetch_playlist_tracks,
    BATCH_SIZE,
    SpotifyRateLimitError,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_user)],
)
logger = logging.getLogger(__name__)


def _get_owned_collection(collection_id: str, current_user: User, db: Session):
    """Return collection if it exists and belongs to current_user; else raise 404."""
    from app.models.collection import Collection
    c = db.query(Collection).filter(Collection.id == collection_id).first()
    if not c or c.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


def _get_owned_collection_by_slug(slug: str, current_user: User, db: Session):
    """Return collection by slug if it exists and belongs to current_user; else raise 404.
    Filters by active source (local vs spotify) so duplicate-slug collections resolve correctly."""
    from app.models.collection import Collection
    active_source = "local" if settings.enable_local_library else "spotify"
    c = (
        db.query(Collection)
        .filter(
            Collection.slug == slug,
            Collection.user_id == current_user.id,
            Collection.source == active_source,
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


def _get_owned_album(album_id: str, current_user: User, db: Session):
    """Return album if it exists and belongs to current_user (or has no owner); else raise 404."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id is not None and album.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Album not found")
    return album


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
    spotify_image_url: str | None = None
    total_tracks: int
    year: int | None
    various_artists: bool
    archived: bool
    is_playlist: bool = False
    created_at: datetime | None

    class Config:
        from_attributes = True


class UpdateAlbumRequest(BaseModel):
    title: str | None = None
    artist: str | None = None
    year: int | None = None
    various_artists: bool | None = None
    archived: bool | None = None
    description: str | None = None


class UpdateTrackRequest(BaseModel):
    title: str | None = None
    artist: str | None = None
    enabled: bool | None = None
    archived: bool | None = None
    is_favorite: bool | None = None
    is_recommended: bool | None = None


class CreateCollectionRequest(BaseModel):
    name: str
    slug: str
    description: str | None = None
    source: str = 'local'  # 'local' | 'spotify'


class UpdateCollectionRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    is_active: bool | None = None
    published: bool | None = None
    source: str | None = None  # 'local' | 'spotify'


class SectionItem(BaseModel):
    order: int
    name: str
    color: str
    start_slot: int | None = None  # 1-based first slot in this section
    end_slot: int | None = None    # 1-based last slot in this section


class UpdateCollectionSectionsRequest(BaseModel):
    sections_enabled: bool
    sections: List[SectionItem] | None = None


class UpdateCollectionSettingsRequest(BaseModel):
    """Default display settings for a collection when viewed in the jukebox."""
    default_sort_order: str | None = None  # 'alphabetical' | 'curated'
    default_show_jump_to_bar: bool | None = None
    default_jump_button_type: str | None = None  # 'letter-ranges' | 'number-ranges' | 'sections'
    default_show_color_coding: bool | None = None
    default_show_card_background: bool | None = None  # True = full overlay, False = 5px top line
    default_edit_mode: bool | None = None
    default_crossfade_seconds: int | None = None  # 0-12
    default_hit_button_mode: str | None = None  # 'favorites' | 'favorites-and-recommended' | 'any' | 'prioritize-section'


def run_library_scan(db: Session):
    """Background task to scan library"""
    album_service = AlbumService(db)
    results = album_service.scan_and_import_library()
    return results


@router.post("/library/scan", response_model=ScanResultResponse)
def scan_library(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger a library scan to import new albums (owned by current user). Disabled when enable_local_library is False."""
    if not settings.enable_local_library:
        raise HTTPException(status_code=503, detail="Local library is disabled. Use Sync from Spotify or Add by URL.")
    album_service = AlbumService(db)
    results = album_service.scan_and_import_library(user_id=current_user.id)
    return results


@router.post("/playlists/scan", response_model=ScanResultResponse)
def scan_playlists_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scan Playlists folder and import each subfolder as an album (owned by current user). Disabled when enable_local_library is False."""
    if not settings.enable_local_library:
        raise HTTPException(status_code=503, detail="Local library is disabled. Use Sync from Spotify or Add by URL.")
    album_service = AlbumService(db)
    results = album_service.scan_and_import_playlists(user_id=current_user.id)
    return results


@router.get("/library/albums", response_model=List[AlbumListResponse])
def list_all_albums(
    limit: int = 1000,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all albums in the database for the current user."""
    album_service = AlbumService(db)
    albums = album_service.get_all_albums(limit=limit, offset=offset, user_id=current_user.id)
    return albums


@router.put("/albums/{album_id}")
def update_album(
    album_id: str,
    request: UpdateAlbumRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update album metadata (must own the album)."""
    album = _get_owned_album(album_id, current_user, db)
    
    # Update provided fields
    if request.title is not None:
        album.title = request.title
    if request.artist is not None:
        album.artist = request.artist
    if request.year is not None:
        album.year = request.year
    if request.various_artists is not None:
        album.various_artists = request.various_artists
    if request.archived is not None:
        album.archived = request.archived
    if request.description is not None:
        album.description = request.description

    db.commit()
    return {"message": "Album updated", "id": album.id}


@router.get("/albums/{album_id}")
def get_album_details(
    album_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get album details with tracks and collections (must own the album)."""
    from app.models.collection_album import CollectionAlbum
    from app.models.collection import Collection

    album = _get_owned_album(album_id, current_user, db)
    
    # Get tracks
    tracks = [{
        "id": track.id,
        "track_number": track.track_number,
        "disc_number": track.disc_number,
        "title": track.title,
        "artist": track.artist,
        "duration_ms": track.duration_ms,
        "enabled": track.enabled,
        "archived": getattr(track, 'archived', False),
        "is_favorite": track.is_favorite,
        "is_recommended": track.is_recommended,
        "file_path": track.file_path,
        "spotify_id": getattr(track, "spotify_id", None),
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
        "spotify_image_url": getattr(album, "spotify_image_url", None),
        "various_artists": album.various_artists,
        "archived": album.archived,
        "description": getattr(album, "description", None),
        "is_playlist": getattr(album, "is_playlist", False),
        "genre": genre_list,
        "tracks": tracks,
        "collection_ids": collection_ids
    }


@router.post("/albums/{album_id}/cover")
def upload_album_cover(
    album_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload custom cover art for an album (must own the album)."""
    album = _get_owned_album(album_id, current_user, db)

    # Validate content type and choose extension
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    ext = allowed.get(content_type)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: JPEG, PNG, GIF, WebP (got {content_type})",
        )

    root = Path(settings.resolved_playlists_path if getattr(album, "is_playlist", False) else settings.music_library_path)
    album_folder = (root / album.file_path).resolve()
    root = root.resolve()
    if not str(album_folder).startswith(str(root)):
        raise HTTPException(status_code=403, detail="Invalid album path")
    if not album_folder.exists() or not album_folder.is_dir():
        raise HTTPException(status_code=400, detail="Album folder not found")

    # Save as custom-cover.{ext} so content-type matches when serving
    custom_cover_filename = "custom-cover" + ext
    custom_cover_path = album_folder / custom_cover_filename
    try:
        # Remove any existing custom-cover.* so we don't leave old files
        for old in album_folder.glob("custom-cover.*"):
            if old.is_file():
                old.unlink()
        contents = file.file.read()
        with open(custom_cover_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        logger.exception("Failed to save custom cover")
        raise HTTPException(status_code=500, detail=f"Failed to save cover: {e}")

    # Store relative path from library root for serving via /api/media
    relative_path = (Path(album.file_path) / custom_cover_filename).as_posix()
    album.custom_cover_art_path = relative_path
    db.commit()

    return {
        "message": "Cover updated",
        "custom_cover_art_path": album.custom_cover_art_path,
    }


@router.delete("/albums/{album_id}/cover")
def restore_album_cover(
    album_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove custom cover and revert to default (must own the album)."""
    album = _get_owned_album(album_id, current_user, db)
    if not album.custom_cover_art_path:
        raise HTTPException(status_code=400, detail="No custom cover to restore")

    root = Path(settings.resolved_playlists_path if getattr(album, "is_playlist", False) else settings.music_library_path)
    custom_cover_full = (root / album.custom_cover_art_path).resolve()
    root = root.resolve()
    if not str(custom_cover_full).startswith(str(root)):
        raise HTTPException(status_code=403, detail="Invalid path")
    if custom_cover_full.exists() and custom_cover_full.is_file():
        try:
            custom_cover_full.unlink()
        except Exception as e:
            logger.exception("Failed to delete custom cover file")
            raise HTTPException(status_code=500, detail=f"Failed to remove file: {e}")

    album.custom_cover_art_path = None
    db.commit()
    return {"message": "Default cover restored"}


@router.put("/tracks/{track_id}")
def update_track(
    track_id: str,
    request: UpdateTrackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update track metadata (track's album must be owned by current user)."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if track.album and track.album.user_id is not None and track.album.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Track not found")
    
    if request.title is not None:
        track.title = request.title
    if request.artist is not None:
        track.artist = request.artist
    if request.enabled is not None:
        track.enabled = request.enabled
    if request.archived is not None:
        track.archived = request.archived
    if request.is_favorite is not None:
        track.is_favorite = request.is_favorite
    if request.is_recommended is not None:
        track.is_recommended = request.is_recommended
    
    db.commit()
    return {"message": "Track updated", "id": track.id}


@router.delete("/albums/{album_id}")
def delete_album(
    album_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an album (must own it)."""
    _get_owned_album(album_id, current_user, db)
    album_service = AlbumService(db)
    if not album_service.delete_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    return {"message": "Album deleted"}


@router.get("/collections", response_model=List[dict])
def list_my_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List collections owned by the current user (for admin UI)."""
    collection_service = CollectionService(db)
    collections = collection_service.get_all_collections(user_id=current_user.id)
    return [
        {
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "description": c.description,
            "is_active": c.is_active,
            "published": getattr(c, "published", False),
            "source": getattr(c, "source", "local"),
            "sections_enabled": getattr(c, "sections_enabled", False),
            "sections": getattr(c, "sections", None),
            "default_sort_order": getattr(c, "default_sort_order", None),
            "default_show_jump_to_bar": getattr(c, "default_show_jump_to_bar", None),
            "default_jump_button_type": getattr(c, "default_jump_button_type", None),
            "default_show_color_coding": getattr(c, "default_show_color_coding", None),
            "default_show_card_background": getattr(c, "default_show_card_background", None),
            "default_edit_mode": getattr(c, "default_edit_mode", None),
            "default_crossfade_seconds": getattr(c, "default_crossfade_seconds", None),
            "default_hit_button_mode": getattr(c, "default_hit_button_mode", None),
        }
        for c in collections
    ]


@router.post("/collections")
def create_collection(
    request: CreateCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new collection (owned by current user)."""
    collection_service = CollectionService(db)
    try:
        collection = collection_service.create_collection(
            name=request.name,
            slug=request.slug,
            description=request.description,
            user_id=current_user.id,
            source=request.source,
        )
        return {
            "id": collection.id,
            "name": collection.name,
            "slug": collection.slug,
            "description": collection.description,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/collections/{collection_id}")
def update_collection(
    collection_id: str,
    request: UpdateCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a collection (must own it)."""
    _get_owned_collection(collection_id, current_user, db)
    collection_service = CollectionService(db)
    try:
        collection = collection_service.update_collection(
            collection_id=collection_id,
            name=request.name,
            slug=request.slug,
            description=request.description,
            is_active=request.is_active,
            published=request.published,
            source=request.source,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"message": "Collection updated"}


@router.delete("/collections/{collection_id}")
def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a collection (must own it)."""
    if collection_id == "00000000-0000-0000-0000-000000000000":
        raise HTTPException(status_code=400, detail="Cannot delete the special 'All Albums' collection")
    _get_owned_collection(collection_id, current_user, db)
    collection_service = CollectionService(db)
    if not collection_service.delete_collection(collection_id):
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"message": "Collection deleted"}


@router.put("/collections/{collection_id}/sections")
def update_collection_sections(
    collection_id: str,
    body: UpdateCollectionSectionsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable/disable sections and set section list (3-10 when enabled)."""
    _get_owned_collection(collection_id, current_user, db)
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


@router.put("/collections/{collection_id}/settings")
def update_collection_settings(
    collection_id: str,
    body: UpdateCollectionSettingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update default display settings for a collection (sort order, jump bar, color coding, edit mode)."""
    _get_owned_collection(collection_id, current_user, db)
    collection_service = CollectionService(db)
    try:
        collection = collection_service.update_collection_settings(
            collection_id,
            default_sort_order=body.default_sort_order,
            default_show_jump_to_bar=body.default_show_jump_to_bar,
            default_jump_button_type=body.default_jump_button_type,
            default_show_color_coding=body.default_show_color_coding,
            default_show_card_background=body.default_show_card_background,
            default_edit_mode=body.default_edit_mode,
            default_crossfade_seconds=body.default_crossfade_seconds,
            default_hit_button_mode=body.default_hit_button_mode,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    return {"message": "Settings updated"}


@router.put("/collections/{slug}/albums")
def update_collection_albums(
    slug: str,
    album_id: str,
    action: str,  # 'add' or 'remove'
    sort_order: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add or remove an album from a collection (must own the collection)."""
    collection = _get_owned_collection_by_slug(slug, current_user, db)
    collection_service = CollectionService(db)
    
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update sort order for an album in a collection (must own the collection)."""
    collection = _get_owned_collection_by_slug(slug, current_user, db)
    collection_service = CollectionService(db)
    
    if not collection_service.update_album_sort_order(collection.id, album_id, new_sort_order):
        raise HTTPException(status_code=404, detail="Album not found in collection")
    
    return {"message": "Album reordered"}


class SetCollectionOrderRequest(BaseModel):
    album_ids: List[str]


@router.put("/collections/{slug}/albums/order")
def set_collection_album_order(
    slug: str,
    body: SetCollectionOrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set full order of albums in a collection (must own the collection)."""
    collection = _get_owned_collection_by_slug(slug, current_user, db)
    collection_service = CollectionService(db)
    
    if not collection_service.set_collection_album_order(collection.id, body.album_ids):
        raise HTTPException(
            status_code=400,
            detail="Invalid album_ids: must match exactly the albums in the collection (no duplicates, no unknowns)"
        )
    
    return {"message": "Collection order saved"}


# --- Spotify admin (Connect, Sync saved albums, Add by URL) ---


def _get_fresh_token(user_id: str, db: Session) -> str:
    """Return a valid Spotify access token, refreshing if expired. Raises 400/401 on failure."""
    from app.models.user_spotify_connection import UserSpotifyConnection
    conn = db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == user_id).first()
    if not conn:
        raise HTTPException(status_code=400, detail="Connect Spotify first")
    token = get_access_token(user_id, db)
    if not token:
        raise HTTPException(status_code=401, detail="Spotify token expired — please reconnect")
    return token


class SpotifyCallbackRequest(BaseModel):
    code: str


@router.post("/spotify/callback")
def spotify_callback(
    body: SpotifyCallbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Exchange Spotify auth code for tokens and store for current user. Called by frontend after redirect."""
    if not exchange_code_and_store(current_user.id, body.code, db):
        raise HTTPException(status_code=400, detail="Failed to connect Spotify")
    return {"message": "Spotify connected"}


@router.get("/spotify/status")
def spotify_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return whether the current user has connected Spotify."""
    return {"connected": is_connected(current_user.id, db)}


@router.get("/spotify/saved-albums")
def spotify_saved_albums(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch saved albums from Spotify (paginated). Returns items with album info."""
    token = _get_fresh_token(current_user.id, db)
    try:
        data = fetch_saved_albums(token, limit=limit, offset=offset)
    except Exception as e:
        # If token was stale despite our check, force a refresh and retry once
        if "401" in str(e):
            from app.models.user_spotify_connection import UserSpotifyConnection
            conn = db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == current_user.id).first()
            token = conn and _refresh_token(conn, db)
            if not token:
                raise HTTPException(status_code=401, detail="Spotify token expired — please reconnect") from e
            try:
                data = fetch_saved_albums(token, limit=limit, offset=offset)
            except Exception as retry_e:
                logger.exception("Spotify saved albums failed after token refresh")
                raise HTTPException(status_code=502, detail=str(retry_e)) from retry_e
        else:
            logger.exception("Spotify saved albums failed")
            raise HTTPException(status_code=502, detail=str(e)) from e
    items = []
    for it in data.get("items") or []:
        album = it.get("album") or {}
        images = album.get("images") or []
        artists = album.get("artists") or []
        items.append({
            "spotify_id": album.get("id"),
            "name": album.get("name"),
            "artists": [a.get("name") for a in artists if a.get("name")],
            "cover_url": images[0].get("url") if images else None,
        })

    # Mark which albums are already in the user's library (still show them, but frontend will disable selection)
    from app.models.album import Album as AlbumModel
    page_ids = [item["spotify_id"] for item in items if item["spotify_id"]]
    existing_ids = set()
    if page_ids:
        existing_ids = {
            row[0]
            for row in db.query(AlbumModel.spotify_id)
            .filter(AlbumModel.user_id == current_user.id, AlbumModel.spotify_id.in_(page_ids))
            .all()
        }
    for item in items:
        item["already_imported"] = item.get("spotify_id") in existing_ids

    return {"items": items, "total": data.get("total", 0)}


@router.get("/spotify/saved-albums/all-ids")
def spotify_all_saved_album_ids(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Page through all of the user's saved Spotify albums and return every album ID.
    Used by the frontend 'Select all' feature so no image data needs to be transferred."""
    token = get_access_token(current_user.id, db)
    if not token:
        raise HTTPException(status_code=400, detail="Connect Spotify first")
    try:
        ids = fetch_all_saved_album_ids(token)
    except Exception as e:
        logger.exception("Spotify all saved album IDs failed")
        raise HTTPException(status_code=502, detail=str(e)) from e

    # Return all IDs plus which are already in the user's library (frontend disables those)
    from app.models.album import Album as AlbumModel
    existing_ids = list(
        row[0]
        for row in db.query(AlbumModel.spotify_id)
        .filter(AlbumModel.user_id == current_user.id, AlbumModel.spotify_id.isnot(None))
        .all()
    )
    return {"ids": ids, "total": len(ids), "already_imported_ids": existing_ids}


class AlbumDetailsByIdsRequest(BaseModel):
    ids: list[str]


@router.post("/spotify/album-details-by-ids")
def spotify_album_details_by_ids(
    body: AlbumDetailsByIdsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch Spotify album details (name, artist, cover) for a list of album IDs.
    Used by the sync modal to display the unimported albums list without pagination."""
    ids = body.ids[:500]
    if not ids:
        return {"items": []}

    token = _get_fresh_token(current_user.id, db)

    album_data_map: dict[str, dict] = {}
    for i in range(0, len(ids), 20):
        chunk = ids[i : i + 20]
        try:
            batch = fetch_albums_batch(token, chunk)
            for album_obj in batch:
                if album_obj and album_obj.get("id"):
                    album_data_map[album_obj["id"]] = album_obj
        except Exception as exc:
            logger.warning("album-details-by-ids batch %d failed: %s", i, exc)

    items = []
    for aid in ids:
        album = album_data_map.get(aid)
        if not album:
            continue
        images = album.get("images") or []
        artists = album.get("artists") or []
        items.append(
            {
                "spotify_id": aid,
                "name": album.get("name"),
                "artists": [a.get("name") for a in artists if a.get("name")],
                "cover_url": images[0].get("url") if images else None,
            }
        )

    return {"items": items}


class AddSpotifyAlbumsRequest(BaseModel):
    spotify_album_ids: List[str]


@router.post("/spotify/add-albums")
def spotify_add_albums(
    body: AddSpotifyAlbumsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update albums (and tracks) from Spotify album IDs for the current user.

    Uses the batch albums endpoint (20 IDs per request) to minimize API calls,
    then fetches tracks individually with rate-limit retry logic.
    """
    token = _get_fresh_token(current_user.id, db)

    # Deduplicate and clean IDs
    ids = [aid for aid in body.spotify_album_ids if aid]

    # Step 1: batch-fetch all album metadata (20 at a time).
    # Throttle so we stay under Spotify's ~180 req/min. 0.5s ≈ 120/min with headroom.
    REQUEST_INTERVAL = 0.5  # seconds between any Spotify API call (batch or track fetch)
    album_data_map: dict[str, dict] = {}
    unavailable_ids: set[str] = set()
    for i in range(0, len(ids), BATCH_SIZE):
        chunk = ids[i : i + BATCH_SIZE]
        try:
            albums_batch = fetch_albums_batch(token, chunk)
            returned_ids = {a.get("id") for a in albums_batch if a.get("id")}
            for album_data in albums_batch:
                sid = album_data.get("id")
                if sid:
                    album_data_map[sid] = album_data
            for aid in chunk:
                if aid not in returned_ids:
                    unavailable_ids.add(aid)
        except SpotifyRateLimitError as e:
            raise HTTPException(status_code=429, detail=str(e)) from e
        except Exception as e:
            logger.warning("Batch fetch failed for chunk %d–%d: %s", i, i + BATCH_SIZE, e)
            for aid in chunk:
                if aid not in album_data_map:
                    album_data_map[aid] = {}
        # Throttle: same interval after every batch so we don't burst (batch1, batch2, ... then track fetches).
        time.sleep(REQUEST_INTERVAL)

    # Step 2: for each ID, create/update album (re-using pre-fetched metadata, fetching tracks).
    # Delay before first album so we don't stack a track fetch right after the last batch call.
    time.sleep(REQUEST_INTERVAL)

    import httpx as _httpx

    added = []
    errors = []
    failed_ids = []
    skipped_unavailable = []
    for idx, aid in enumerate(ids):
        # Skip albums Spotify told us don't exist (null in batch response)
        if aid in unavailable_ids:
            skipped_unavailable.append(aid)
            continue

        # Resolve a human-readable name for error messages
        pre_fetched = album_data_map.get(aid) or {}
        album_label = pre_fetched.get("name") or aid

        savepoint = db.begin_nested()
        try:
            album = create_or_update_album_from_spotify(
                current_user.id, aid, token, db, album_data=pre_fetched or None, auto_commit=False
            )
            if album:
                savepoint.commit()
                db.commit()
                db.refresh(album)
                added.append({"id": album.id, "title": album.title, "artist": album.artist})
            else:
                # Returned None — no tracks or other skip condition; don't save anything
                savepoint.rollback()
                skipped_unavailable.append(aid)
        except SpotifyRateLimitError as e:
            savepoint.rollback()
            # Stop processing and surface the rate limit — partial results returned
            errors.append(f"Rate limit reached after {len(added)} albums: {e}")
            failed_ids.extend(ids[idx:])
            break
        except _httpx.HTTPStatusError as e:
            savepoint.rollback()
            status = e.response.status_code if e.response is not None else "?"
            if status in (404, 400):
                # Album is unavailable/deleted — skip silently
                skipped_unavailable.append(aid)
                logger.info("Skipping unavailable Spotify album %s (HTTP %s)", aid, status)
            else:
                errors.append(f"{album_label}: HTTP {status}")
                failed_ids.append(aid)
        except Exception as e:
            savepoint.rollback()
            errors.append(f"{album_label}: {str(e)[:120]}")
            failed_ids.append(aid)

        # Throttle: same interval after each album's track fetch(s)
        if idx < len(ids) - 1:
            time.sleep(REQUEST_INTERVAL)

    return {
        "added": len(added),
        "albums": added,
        "errors": errors,
        "failed_ids": failed_ids,
        "skipped_unavailable": skipped_unavailable,
    }


class AddByUrlRequest(BaseModel):
    url: str
    add_to_collection_id: str | None = None


@router.post("/spotify/add-by-url")
def spotify_add_by_url(
    body: AddByUrlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse Spotify album or playlist URL, fetch metadata/tracks, and add to library. Optionally add to collection."""
    token = get_access_token(current_user.id, db)
    if not token:
        raise HTTPException(status_code=400, detail="Connect Spotify first")
    parsed = parse_spotify_url(body.url)
    if not parsed:
        raise HTTPException(status_code=400, detail="Invalid Spotify URL. Use an album or playlist link.")
    kind, spotify_id = parsed
    try:
        if kind == "album":
            album = create_or_update_album_from_spotify(current_user.id, spotify_id, token, db)
            if not album:
                raise HTTPException(status_code=502, detail="Failed to add album")
            collection_id = body.add_to_collection_id
            if collection_id:
                _get_owned_collection(collection_id, current_user, db)
                collection_service = CollectionService(db)
                collection_service.add_album_to_collection(collection_id, album.id, None)
            return {"message": "Album added", "album_id": album.id, "title": album.title, "artist": album.artist}
        # Playlist: create one album (is_playlist) with tracks from playlist
        pl = fetch_playlist(token, spotify_id)
        pl_tracks = fetch_playlist_tracks(token, spotify_id)
        name = pl.get("name") or "Playlist"
        file_path = f"spotify/playlist/{current_user.id}/{spotify_id}"
        existing = (
            db.query(Album)
            .filter(Album.user_id == current_user.id, Album.file_path == file_path)
            .first()
        )
        if existing:
            album = existing
            album.title = name
            album.total_tracks = len(pl_tracks)
        else:
            album = Album(
                user_id=current_user.id,
                file_path=file_path,
                title=name,
                artist="Various",
                total_tracks=len(pl_tracks),
                is_playlist=True,
            )
            db.add(album)
            db.flush()
        # Sync tracks: clear and re-add from playlist (simple approach)
        for t in list(album.tracks):
            db.delete(t)
        for i, tr in enumerate(pl_tracks):
            tid = tr.get("id") or ""
            t = Track(
                album_id=album.id,
                disc_number=1,
                track_number=i + 1,
                title=tr.get("name") or "Track",
                artist=(tr.get("artists") or [{}])[0].get("name", "Unknown"),
                duration_ms=tr.get("duration_ms") or 0,
                enabled=True,
                file_path=f"spotify/playlist/{current_user.id}/{spotify_id}/{tid or i}",
                spotify_id=tid or None,
            )
            db.add(t)
        album.total_tracks = len(pl_tracks)
        db.commit()
        db.refresh(album)
        if body.add_to_collection_id:
            _get_owned_collection(body.add_to_collection_id, current_user, db)
            CollectionService(db).add_album_to_collection(body.add_to_collection_id, album.id, None)
        return {"message": "Playlist added", "album_id": album.id, "title": album.title, "artist": album.artist}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Add by URL failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/sanitize-tracks")
def sanitize_library_titles(db: Session = Depends(get_db)):
    """
    Sanitize album and track titles in the database by removing remaster annotations.

    Removes parentheses containing 'remaster' or 'remastered' (e.g. "(2014 Remaster)")
    from both album titles and track titles. Works for local and Spotify-sourced data.
    """
    from app.utils.metadata_extractor import sanitize_track_title

    # Sanitize album titles
    albums = db.query(Album).all()
    albums_updated = 0
    for album in albums:
        original = album.title
        sanitized = sanitize_track_title(original)
        if sanitized != original:
            album.title = sanitized
            albums_updated += 1
            logger.info("Sanitized album: %r -> %r", original, sanitized)

    # Sanitize track titles
    tracks = db.query(Track).all()
    tracks_updated = 0
    for track in tracks:
        original_title = track.title
        sanitized_title = sanitize_track_title(original_title)
        if sanitized_title != original_title:
            track.title = sanitized_title
            tracks_updated += 1
            logger.info("Sanitized track: %r -> %r", original_title, sanitized_title)

    db.commit()

    return {
        "message": f"Sanitized {albums_updated} album(s) and {tracks_updated} track(s)",
        "total_albums": len(albums),
        "updated_albums": albums_updated,
        "total_tracks": len(tracks),
        "updated_count": tracks_updated,
    }
