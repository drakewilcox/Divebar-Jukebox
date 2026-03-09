"""Queue API endpoints"""
import logging
import random
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.deps import get_session_id

logger = logging.getLogger(__name__)


def _safe_selection_display(sel: tuple) -> str | None:
    """Format (album_display_number, track_number_1based) for display; return None if invalid."""
    if not sel or len(sel) < 2:
        return None
    try:
        a, b = int(sel[0]), int(sel[1])
        return f"{a:03d}-{b:02d}"
    except (TypeError, ValueError):
        return None
from app.services.queue_service import QueueService
from app.services.collection_service import CollectionService
from app.services.album_service import AlbumService
from app.services.track_service import TrackService

router = APIRouter(prefix="/api/queue", tags=["queue"])


class TrackInfo(BaseModel):
    id: str
    title: str
    artist: str
    duration_ms: int
    album_title: str
    album_artist: str
    cover_art_path: str | None
    spotify_image_url: str | None = None  # Spotify album art when no local cover (Spotify mode)
    is_playlist: bool = False
    selection_display: str | None = None
    album_id: str | None = None  # for frontend to compute selection_display in current sort
    track_number: int | None = None  # 1-based track index in album


class QueueItemResponse(BaseModel):
    id: str
    position: int
    status: str
    queued_at: str
    track: TrackInfo


class AddToQueueRequest(BaseModel):
    collection: str
    user_slug: Optional[str] = None  # When set, resolve collection by (user_slug, collection)
    album_number: int
    track_number: int = 0  # 0 means entire album


class ReorderQueueRequest(BaseModel):
    queue_ids: List[str]  # Queue item IDs in desired order (including currently playing)


class AddFavoritesRandomRequest(BaseModel):
    collection: str
    user_slug: Optional[str] = None
    count: int = 10
    # 'favorites' | 'favorites-and-recommended' | 'any'
    mode: str = 'favorites'
    # When provided, prioritize tracks from this slot range (section-aware mode)
    section_name: Optional[str] = None
    section_start_slot: Optional[int] = None
    section_end_slot: Optional[int] = None  # None means "to end of collection"


def _resolve_collection_id(collection_service: CollectionService, collection: str, user_slug: str | None) -> str:
    """Resolve collection slug (and optional user_slug) to collection_id."""
    if user_slug:
        obj = collection_service.get_collection_by_user_slug_and_collection_slug(user_slug, collection)
        if not obj:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
        return obj.id
    if collection == "all":
        return "00000000-0000-0000-0000-000000000000"
    obj = collection_service.get_collection_by_slug(collection)
    if not obj:
        raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
    return obj.id


@router.get("", response_model=List[QueueItemResponse])
def get_queue(
    collection: str = Query(..., description="Collection slug"),
    user_slug: str | None = Query(None, description="Owner user slug (for /:user_slug/:collection_slug)"),
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
):
    """Get current queue for a collection + session"""
    try:
        collection_service = CollectionService(db)
        queue_service = QueueService(db)
        track_service = TrackService(db)
        album_service = AlbumService(db)

        collection_id = _resolve_collection_id(collection_service, collection, user_slug)
        queue_items = queue_service.get_queue(collection_id, session_id, include_played=False)
        response = []
        for item in queue_items:
            try:
                if not getattr(item, "track", None) or not getattr(item.track, "album", None):
                    continue
                album = item.track.album
                cover = album.custom_cover_art_path or album.cover_art_path
                selection_display = None
                track_number_1based = None
                if collection_id == '00000000-0000-0000-0000-000000000000':
                    all_albums = album_service.get_all_albums(limit=10000)
                    for idx, a in enumerate(all_albums):
                        if a.id == album.id:
                            tracks = track_service.get_tracks_by_album(album.id)
                            for ti, t in enumerate(tracks):
                                if t.id == item.track.id:
                                    track_number_1based = ti + 1
                                    selection_display = f"{(idx + 1):03d}-{(ti + 1):02d}"
                                    break
                            break
                else:
                    sel = collection_service.get_selection_for_track(collection_id, str(item.track.id))
                    if sel:
                        try:
                            track_number_1based = int(sel[1])
                        except (TypeError, ValueError):
                            track_number_1based = None
                        selection_display = _safe_selection_display(sel)
                queued_at = getattr(item, "queued_at", None)
                queued_at_str = queued_at.isoformat() if isinstance(queued_at, datetime) else (str(queued_at) if queued_at else "")
                try:
                    position_val = int(item.position) if item.position is not None else 0
                except (TypeError, ValueError):
                    position_val = 0
                response.append({
                    "id": str(item.id),
                    "position": position_val,
                    "status": str(getattr(item.status, "value", item.status)),
                    "queued_at": queued_at_str,
                    "track": {
                        "id": str(item.track.id),
                        "title": str(item.track.title) if getattr(item.track, "title", None) is not None else "",
                        "artist": str(item.track.artist) if getattr(item.track, "artist", None) is not None else "",
                        "duration_ms": int(item.track.duration_ms) if getattr(item.track, "duration_ms", None) is not None else 0,
                        "album_title": str(album.title) if getattr(album, "title", None) is not None else "",
                        "album_artist": str(album.artist) if getattr(album, "artist", None) is not None else "",
                        "cover_art_path": str(cover) if cover is not None else None,
                        "spotify_image_url": None if getattr(album, "spotify_image_url", None) is None else str(album.spotify_image_url),
                        "is_playlist": bool(getattr(album, "is_playlist", False)),
                        "selection_display": str(selection_display) if selection_display is not None else None,
                        "album_id": str(album.id),
                        "track_number": int(track_number_1based) if track_number_1based is not None else None,
                    }
                })
            except Exception as item_err:
                logger.warning("Skipping queue item %s: %s", getattr(item, "id", None), item_err, exc_info=True)
                continue

        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_queue failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
def add_to_queue(
    request: AddToQueueRequest,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
):
    """Add track(s) to queue by album and track number (per session)"""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    album_service = AlbumService(db)
    track_service = TrackService(db)

    collection_id = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    all_collection_id = "00000000-0000-0000-0000-000000000000"

    if collection_id == all_collection_id:
        all_albums = album_service.get_all_albums(limit=10000)
        if request.album_number < 1 or request.album_number > len(all_albums):
            raise HTTPException(status_code=404, detail=f"Album number {request.album_number} not found in 'All Albums'")
        album = all_albums[request.album_number - 1]
        if request.track_number == 0:
            tracks_all = track_service.get_tracks_by_album(album.id, enabled_only=False)
            track_ids = [t.id for t in tracks_all if not getattr(t, "archived", False)]
            count = queue_service.add_album_to_queue(collection_id, session_id, track_ids)
            return {"message": f"Added {count} tracks to queue", "count": count}
        tracks = track_service.get_tracks_by_album(album.id)
        if request.track_number < 1 or request.track_number > len(tracks):
            raise HTTPException(status_code=404, detail=f"Track {request.track_number} not found in album {request.album_number}")
        track = tracks[request.track_number - 1]
        queue_item = queue_service.add_to_queue(collection_id, session_id, track.id)
        if not queue_item:
            return {"message": "Already in queue", "already_queued": True}
        return {"message": "Track added to queue", "queue_id": queue_item.id}

    albums = collection_service.get_collection_albums(collection_id, include_tracks=True)
    album = next((a for a in albums if a['display_number'] == request.album_number), None)
    if not album:
        raise HTTPException(
            status_code=404,
            detail=f"Album number {request.album_number} not found in collection '{request.collection}'"
        )

    if request.track_number == 0:
        tracks_all = track_service.get_tracks_by_album(album['id'], enabled_only=False)
        track_ids = [t.id for t in tracks_all if not getattr(t, 'archived', False)]
        count = queue_service.add_album_to_queue(collection_id, session_id, track_ids)
        return {"message": f"Added {count} tracks to queue", "count": count}

    tracks = album.get('tracks', [])
    if request.track_number < 1 or request.track_number > len(tracks):
        raise HTTPException(
            status_code=404,
            detail=f"Track {request.track_number} not found in album {request.album_number} (album has {len(tracks)} visible tracks)"
        )

    track = tracks[request.track_number - 1]
    queue_item = queue_service.add_to_queue(collection_id, session_id, track['id'])
    if not queue_item:
        return {"message": "Already in queue", "already_queued": True}
    return {"message": "Track added to queue", "queue_id": queue_item.id}


@router.post("/add-favorites-random")
def add_favorites_random(
    request: AddFavoritesRandomRequest,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
):
    """Add up to count random tracks from the collection to the queue based on mode.

    Modes:
      - 'favorites'                 – only tracks marked is_favorite (original behaviour)
      - 'favorites-and-recommended' – tracks that are is_favorite OR is_recommended
      - 'any'                       – any enabled track regardless of flags

    When section_start_slot is provided (section-aware mode):
      - Tracks within the slot range are added first.
      - If fewer than count are available without duplicates, the remainder is
        filled from the rest of the collection using the same mode filter.
      - The response message names the section when every added track came from it.
    """
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    album_service = AlbumService(db)
    track_service = TrackService(db)
    count = max(1, min(request.count, 100))
    mode = request.mode  # 'favorites' | 'favorites-and-recommended' | 'any'

    all_collection_id = "00000000-0000-0000-0000-000000000000"

    # ── helpers ────────────────────────────────────────────────────────────────

    def track_matches_dict(t: dict) -> bool:
        if mode == 'any':
            return True
        if mode == 'favorites-and-recommended':
            return bool(t.get('is_favorite')) or bool(t.get('is_recommended'))
        return bool(t.get('is_favorite'))

    def track_matches_obj(t) -> bool:
        if mode == 'any':
            return True
        if mode == 'favorites-and-recommended':
            return bool(t.is_favorite) or bool(t.is_recommended)
        return bool(t.is_favorite)

    # ── collect eligible track IDs ─────────────────────────────────────────────

    section_track_ids: list = []
    other_track_ids: list = []

    collection_id_for_queue = _resolve_collection_id(collection_service, request.collection, request.user_slug)
    if collection_id_for_queue == all_collection_id:
        # "all" virtual collection has no section concept – gather from every album
        all_albums = album_service.get_all_albums(limit=10000)
        for album in all_albums:
            tracks = track_service.get_tracks_by_album(album.id)
            for t in tracks:
                if track_matches_obj(t):
                    other_track_ids.append(t.id)
    else:
        albums = collection_service.get_collection_albums(collection_id_for_queue, include_tracks=True)

        use_section = request.section_start_slot is not None
        end_slot = request.section_end_slot  # None → to end of collection

        for album in albums:
            for t in album.get("tracks", []):
                if not track_matches_dict(t):
                    continue
                if use_section:
                    slot = album.get("display_number")
                    in_section = (
                        slot is not None
                        and slot >= request.section_start_slot
                        and (end_slot is None or slot <= end_slot)
                    )
                    if in_section:
                        section_track_ids.append(t["id"])
                    else:
                        other_track_ids.append(t["id"])
                else:
                    other_track_ids.append(t["id"])

    # ── remove already-queued tracks ──────────────────────────────────────────

    queue_items = queue_service.get_queue(collection_id_for_queue, session_id, include_played=False)
    queued_track_ids = {item.track_id for item in queue_items}

    avail_section = [tid for tid in section_track_ids if tid not in queued_track_ids]
    avail_other = [tid for tid in other_track_ids if tid not in queued_track_ids]
    random.shuffle(avail_section)
    random.shuffle(avail_other)

    to_add = avail_section[:count]
    section_ids_set = set(section_track_ids)
    if len(to_add) < count:
        to_add += avail_other[:count - len(to_add)]

    added = 0
    added_from_section = 0
    for track_id in to_add:
        if queue_service.add_to_queue(collection_id_for_queue, session_id, track_id):
            added += 1
            if track_id in section_ids_set:
                added_from_section += 1

    # ── build response message ────────────────────────────────────────────────

    all_from_section = (
        added > 0
        and added_from_section == added
        and bool(section_track_ids)
        and request.section_name
    )
    some_from_section = (
        added > 0
        and added_from_section > 0
        and added_from_section < added
        and bool(section_track_ids)
        and request.section_name
    )

    total_eligible = len(section_track_ids) + len(other_track_ids)
    total_available = len(avail_section) + len(avail_other)

    if added > 0:
        if mode == "any":
            label = "Tracks" if added != 1 else "Track"
            message = f"Added {added} {label} from Collection to Queue."
        elif mode == "favorites-and-recommended":
            label = "Hits" if added != 1 else "Hit"
            message = f"Added {added} Favorited or Recommended {label} to Queue."
        elif all_from_section:
            message = f'Added {added} Hits from "{request.section_name}" to Queue.'
        elif some_from_section:
            message = f'Added {added} Hits from "{request.section_name}" and Favorites to Queue.'
        else:
            # favorites (or prioritize-section with none from section)
            message = f"Added {added} Hits from Favorites to Queue."
    elif total_eligible == 0:
        message = "No matching tracks found in collection."
    elif total_available == 0:
        if mode == "any":
            message = "No more tracks available (already in queue). Added 0."
        else:
            message = "No more hits available (already in queue). Added 0."
    else:
        message = "Added 0 to the queue."

    return {"message": message, "added": added}


@router.put("/order")
def reorder_queue(
    collection: str = Query(..., description="Collection slug"),
    user_slug: str | None = Query(None),
    session_id: str = Depends(get_session_id),
    body: ReorderQueueRequest = ...,
    db: Session = Depends(get_db),
):
    """Reorder queue by providing queue item IDs (including currently playing). Queue must belong to this session."""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    collection_id = _resolve_collection_id(collection_service, collection, user_slug)

    if not queue_service.reorder_queue(collection_id, session_id, body.queue_ids):
        raise HTTPException(
            status_code=400,
            detail="Reorder failed: one or more queue IDs not found or not in this collection",
        )
    return {"message": "Queue reordered"}


@router.delete("/{queue_id}")
def remove_from_queue(
    queue_id: str,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
):
    """Remove a track from the queue (must belong to this session)."""
    queue_service = QueueService(db)
    if not queue_service.remove_from_queue(queue_id, session_id):
        raise HTTPException(status_code=404, detail=f"Queue item '{queue_id}' not found")
    return {"message": "Track removed from queue"}


@router.delete("")
def clear_queue(
    collection: str = Query(..., description="Collection slug"),
    user_slug: str | None = Query(None),
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
):
    """Clear the queue for this collection + session."""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    collection_id = _resolve_collection_id(collection_service, collection, user_slug)
    count = queue_service.clear_queue(collection_id, session_id, clear_played=True)
    return {"message": f"Cleared {count} items from queue", "count": count}
