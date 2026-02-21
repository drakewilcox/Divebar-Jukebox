"""Queue API endpoints"""
import random
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.database import get_db
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
    selection_display: str | None = None


class QueueItemResponse(BaseModel):
    id: str
    position: int
    status: str
    queued_at: str
    track: TrackInfo


class AddToQueueRequest(BaseModel):
    collection: str
    album_number: int
    track_number: int = 0  # 0 means entire album


class ReorderQueueRequest(BaseModel):
    queue_ids: List[str]  # Queue item IDs in desired order (including currently playing)


class AddFavoritesRandomRequest(BaseModel):
    collection: str
    count: int = 10  # Number of random favorite tracks to add


@router.get("", response_model=List[QueueItemResponse])
def get_queue(collection: str = Query(..., description="Collection slug"), db: Session = Depends(get_db)):
    """Get current queue for a collection"""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    track_service = TrackService(db)
    album_service = AlbumService(db)
    
    # Handle "all" collection
    if collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        queue_items = queue_service.get_queue(all_collection_id, include_played=False)
    else:
        collection_obj = collection_service.get_collection_by_slug(collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
        
        queue_items = queue_service.get_queue(collection_obj.id, include_played=False)
    
    # Build response with track info: use only database-saved values (track/album rows), not file metadata
    collection_id = all_collection_id if collection == 'all' else collection_obj.id
    response = []
    for item in queue_items:
        if item.track and item.track.album:
            album = item.track.album
            cover = album.custom_cover_art_path or album.cover_art_path
            selection_display = None
            if collection_id == '00000000-0000-0000-0000-000000000000':
                all_albums = album_service.get_all_albums(limit=10000)
                for idx, a in enumerate(all_albums):
                    if a.id == album.id:
                        tracks = track_service.get_tracks_by_album(album.id)
                        for ti, t in enumerate(tracks):
                            if t.id == item.track.id:
                                selection_display = f"{(idx + 1):03d}-{(ti + 1):02d}"
                                break
                        break
            else:
                sel = collection_service.get_selection_for_track(collection_id, item.track.id)
                if sel:
                    selection_display = f"{sel[0]:03d}-{sel[1]:02d}"
            response.append({
                "id": item.id,
                "position": item.position,
                "status": item.status.value,
                "queued_at": item.queued_at.isoformat(),
                "track": {
                    "id": item.track.id,
                    "title": item.track.title,
                    "artist": item.track.artist,
                    "duration_ms": item.track.duration_ms,
                    "album_title": album.title,
                    "album_artist": album.artist,
                    "cover_art_path": cover,
                    "selection_display": selection_display,
                }
            })
    
    return response


@router.post("")
def add_to_queue(request: AddToQueueRequest, db: Session = Depends(get_db)):
    """Add track(s) to queue by album and track number"""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    album_service = AlbumService(db)
    track_service = TrackService(db)
    
    # Handle "all" collection differently
    if request.collection == 'all':
        # Get all albums, ordered by artist/title
        all_albums = album_service.get_all_albums(limit=10000)
        
        # Find album by display number (1-indexed)
        if request.album_number < 1 or request.album_number > len(all_albums):
            raise HTTPException(
                status_code=404,
                detail=f"Album number {request.album_number} not found in 'All Albums'"
            )
        
        album = all_albums[request.album_number - 1]
        tracks = track_service.get_tracks_by_album(album.id)
        
        # Use special UUID for "all" collection
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        
        # If track_number is 0, add all tracks from album
        if request.track_number == 0:
            track_ids = [t.id for t in tracks]
            count = queue_service.add_album_to_queue(all_collection_id, track_ids)
            return {"message": f"Added {count} tracks to queue", "count": count}
        
        # Otherwise, add specific track by display position (1-indexed)
        # User enters display number (1-N), we convert to array index (0-based)
        if request.track_number < 1 or request.track_number > len(tracks):
            raise HTTPException(
                status_code=404,
                detail=f"Track {request.track_number} not found in album {request.album_number} (album has {len(tracks)} visible tracks)"
            )
        
        track = tracks[request.track_number - 1]
        queue_item = queue_service.add_to_queue(all_collection_id, track.id)
        if not queue_item:
            return {"message": "Already in queue", "already_queued": True}
        return {"message": "Track added to queue", "queue_id": queue_item.id}
    
    # Get collection
    collection_obj = collection_service.get_collection_by_slug(request.collection)
    if not collection_obj:
        raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
    
    # Get albums in collection
    albums = collection_service.get_collection_albums(collection_obj.id, include_tracks=True)
    
    # Find album by display number
    album = next((a for a in albums if a['display_number'] == request.album_number), None)
    if not album:
        raise HTTPException(
            status_code=404,
            detail=f"Album number {request.album_number} not found in collection '{request.collection}'"
        )
    
    # If track_number is 0, add all tracks from album
    if request.track_number == 0:
        track_ids = [t['id'] for t in album.get('tracks', [])]
        count = queue_service.add_album_to_queue(collection_obj.id, track_ids)
        return {"message": f"Added {count} tracks to queue", "count": count}
    
    # Otherwise, add specific track by display position (1-indexed)
    # User enters display number (1-N), we convert to array index (0-based)
    tracks = album.get('tracks', [])
    if request.track_number < 1 or request.track_number > len(tracks):
        raise HTTPException(
            status_code=404,
            detail=f"Track {request.track_number} not found in album {request.album_number} (album has {len(tracks)} visible tracks)"
        )
    
    track = tracks[request.track_number - 1]
    queue_item = queue_service.add_to_queue(collection_obj.id, track['id'])
    if not queue_item:
        return {"message": "Already in queue", "already_queued": True}
    return {"message": "Track added to queue", "queue_id": queue_item.id}


@router.post("/add-favorites-random")
def add_favorites_random(request: AddFavoritesRandomRequest, db: Session = Depends(get_db)):
    """Add up to `count` random favorite tracks from the collection to the queue, avoiding duplicates."""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    album_service = AlbumService(db)
    track_service = TrackService(db)
    count = max(1, min(request.count, 100))

    all_collection_id = "00000000-0000-0000-0000-000000000000"

    if request.collection == "all":
        all_albums = album_service.get_all_albums(limit=10000)
        favorite_track_ids = []
        for album in all_albums:
            tracks = track_service.get_tracks_by_album(album.id)
            favorite_track_ids.extend(t.id for t in tracks if t.is_favorite)
        collection_id_for_queue = all_collection_id
    else:
        collection_obj = collection_service.get_collection_by_slug(request.collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{request.collection}' not found")
        albums = collection_service.get_collection_albums(collection_obj.id, include_tracks=True)
        favorite_track_ids = []
        for album in albums:
            for t in album.get("tracks", []):
                if t.get("is_favorite"):
                    favorite_track_ids.append(t["id"])
        collection_id_for_queue = collection_obj.id

    queue_items = queue_service.get_queue(collection_id_for_queue, include_played=False)
    queued_track_ids = {item.track_id for item in queue_items}
    available = [tid for tid in favorite_track_ids if tid not in queued_track_ids]
    random.shuffle(available)
    to_add = available[:count]
    added = 0
    for track_id in to_add:
        if queue_service.add_to_queue(collection_id_for_queue, track_id):
            added += 1

    message = f"Added {added} favorite track{'s' if added != 1 else ''} to the queue."
    if added < count and len(available) < count and len(favorite_track_ids) < count:
        message = f"Only {len(favorite_track_ids)} favorite(s) in collection; added {added}."
    elif added < count and len(available) < count:
        message = f"No more favorites available (already in queue). Added {added}."
    return {"message": message, "added": added}


@router.put("/order")
def reorder_queue(
    collection: str = Query(..., description="Collection slug"),
    body: ReorderQueueRequest = ...,
    db: Session = Depends(get_db),
):
    """Reorder queue by providing queue item IDs in the desired order (including currently playing)."""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)

    if collection == "all":
        collection_id = "00000000-0000-0000-0000-000000000000"
    else:
        collection_obj = collection_service.get_collection_by_slug(collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
        collection_id = collection_obj.id

    if not queue_service.reorder_queue(collection_id, body.queue_ids):
        raise HTTPException(
            status_code=400,
            detail="Reorder failed: one or more queue IDs not found or not in this collection",
        )
    return {"message": "Queue reordered"}


@router.delete("/{queue_id}")
def remove_from_queue(queue_id: str, db: Session = Depends(get_db)):
    """Remove a track from the queue"""
    queue_service = QueueService(db)
    
    if not queue_service.remove_from_queue(queue_id):
        raise HTTPException(status_code=404, detail=f"Queue item '{queue_id}' not found")
    
    return {"message": "Track removed from queue"}


@router.delete("")
def clear_queue(collection: str = Query(..., description="Collection slug"), db: Session = Depends(get_db)):
    """Clear the queue for a collection"""
    collection_service = CollectionService(db)
    queue_service = QueueService(db)
    
    # Handle "all" collection
    if collection == 'all':
        all_collection_id = '00000000-0000-0000-0000-000000000000'
        count = queue_service.clear_queue(all_collection_id, clear_played=True)
    else:
        collection_obj = collection_service.get_collection_by_slug(collection)
        if not collection_obj:
            raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
        
        count = queue_service.clear_queue(collection_obj.id, clear_played=True)
    
    return {"message": f"Cleared {count} items from queue", "count": count}
