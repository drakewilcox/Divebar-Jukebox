"""Collection service for managing collections and their albums"""
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
import json
import logging
from pathlib import Path

from app.models.collection import Collection
from app.models.collection_album import CollectionAlbum
from app.models.album import Album
from app.models.track import Track
from app.config import settings

logger = logging.getLogger(__name__)


class CollectionService:
    """Service for collection-related operations"""
    
    def __init__(self, db: Session):
        """
        Initialize collection service
        
        Args:
            db: Database session
        """
        self.db = db
        self.config_dir = Path(settings.collections_config_dir)
    
    def create_collection(self, name: str, slug: str, description: str = None, user_id: str = None, source: str = 'local') -> Collection:
        """
        Create a new collection.

        Args:
            name: Collection display name
            slug: URL-safe slug (unique per user)
            description: Optional description
            user_id: Owner user ID (required)

        Returns:
            Created Collection instance
        """
        if not user_id:
            raise ValueError("user_id is required")

        if source not in ('local', 'spotify'):
            raise ValueError("source must be 'local' or 'spotify'")

        existing = self.db.query(Collection).filter(
            Collection.user_id == user_id,
            Collection.slug == slug,
            Collection.source == source,
        ).first()
        if existing:
            raise ValueError(f"A {source} collection with slug '{slug}' already exists for this user")

        collection = Collection(
            user_id=user_id,
            name=name,
            slug=slug,
            description=description,
            is_active=True,
            published=False,
            source=source,
        )
        self.db.add(collection)
        self.db.commit()
        logger.info(f"Created collection: {name} ({slug}) for user {user_id}")
        return collection
    
    def update_collection(
        self,
        collection_id: str,
        name: str = None,
        slug: str = None,
        description: str = None,
        is_active: bool = None,
        published: bool = None,
        source: str = None,
    ) -> Optional[Collection]:
        """
        Update a collection.

        Args:
            collection_id: Collection UUID
            name: New name (optional)
            slug: New URL-safe slug (optional; unique per user)
            description: New description (optional)
            is_active: Active status (optional)

        Returns:
            Updated Collection instance or None
        """
        collection = self.db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            return None

        if name is not None:
            collection.name = name
        if slug is not None:
            effective_source = source if source is not None else collection.source
            if slug != collection.slug:
                existing = self.db.query(Collection).filter(
                    Collection.user_id == collection.user_id,
                    Collection.slug == slug,
                    Collection.source == effective_source,
                ).first()
                if existing:
                    raise ValueError(f"A {effective_source} collection with slug '{slug}' already exists for this user")
            collection.slug = slug
        if description is not None:
            collection.description = description
        if is_active is not None:
            collection.is_active = is_active
        if published is not None and hasattr(collection, "published"):
            collection.published = bool(published)
        if source is not None:
            if source not in ('local', 'spotify'):
                raise ValueError("source must be 'local' or 'spotify'")
            collection.source = source

        self.db.commit()
        logger.info(f"Updated collection: {collection.name}")
        return collection

    def update_collection_sections(
        self, collection_id: str, sections_enabled: bool, sections: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Collection]:
        """
        Update sections for a collection. When sections_enabled is True, sections must have 3-10 items.
        Each section: {"order": int, "name": str, "color": str}.
        """
        collection = self.db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            return None
        if sections_enabled:
            if not sections or not isinstance(sections, list):
                raise ValueError("When enabling sections, provide a list of 3-10 sections")
            if len(sections) < 3 or len(sections) > 10:
                raise ValueError("Collection must have between 3 and 10 sections")
            seen_orders = set()
            for i, sec in enumerate(sections):
                if not isinstance(sec, dict):
                    raise ValueError("Each section must be an object with order, name, and color")
                order = sec.get("order", i)
                name = (sec.get("name") or "").strip()
                color = (sec.get("color") or "").strip()
                if not name:
                    raise ValueError("Section name is required")
                if not color:
                    raise ValueError("Section color is required")
                if order in seen_orders:
                    raise ValueError("Section order must be unique")
                seen_orders.add(order)
            # Validate ranges if present: contiguous 1-based; last section may have end_slot omitted ("to end")
            def has_ranges(sections_list):
                if not sections_list:
                    return False
                sorted_sec = sorted(sections_list, key=lambda s: s.get("order", 0))
                for i, s in enumerate(sorted_sec):
                    if not isinstance(s, dict) or s.get("start_slot") is None:
                        return False
                    if i < len(sorted_sec) - 1 and s.get("end_slot") is None:
                        return False  # non-last section must have end_slot
                return True

            if has_ranges(sections):
                sorted_by_order = sorted(sections, key=lambda s: s.get("order", 0))
                for i, sec in enumerate(sorted_by_order):
                    start_slot = sec.get("start_slot")
                    end_slot = sec.get("end_slot")
                    if start_slot is None or start_slot < 1:
                        raise ValueError("Section start_slot must be >= 1")
                    is_last = i == len(sorted_by_order) - 1
                    if is_last:
                        # Last section: end_slot may be None (open-ended so new albums are included)
                        if end_slot is not None and end_slot < 1:
                            raise ValueError("Section end_slot must be >= 1 when set")
                        if end_slot is not None and start_slot > end_slot:
                            raise ValueError("Section start_slot must be <= end_slot when end_slot is set")
                    else:
                        if end_slot is None or end_slot < 1:
                            raise ValueError("Non-last section end_slot must be >= 1")
                        if start_slot > end_slot:
                            raise ValueError("Section start_slot must be <= end_slot")
                    if i == 0 and start_slot != 1:
                        raise ValueError("First section must start at slot 1")
                    if i > 0:
                        prev_end = sorted_by_order[i - 1].get("end_slot")
                        prev_start = sorted_by_order[i - 1].get("start_slot")
                        if prev_end is None:
                            raise ValueError("Only the last section may have end_slot omitted")
                        if start_slot != prev_end + 1:
                            raise ValueError("Section ranges must be contiguous (no gaps)")
            collection.sections = sections
        else:
            collection.sections = None
        collection.sections_enabled = sections_enabled
        self.db.commit()
        logger.info(f"Updated sections for collection: {collection.name}")
        return collection

    def update_collection_settings(
        self,
        collection_id: str,
        default_sort_order: str = None,
        default_show_jump_to_bar: bool = None,
        default_jump_button_type: str = None,
        default_show_color_coding: bool = None,
        default_show_card_background: bool = None,
        default_edit_mode: bool = None,
        default_crossfade_seconds: int = None,
        default_hit_button_mode: str = None,
    ) -> Optional[Collection]:
        """Update default display settings for a collection."""
        collection = self.db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            return None
        if default_sort_order is not None:
            if default_sort_order not in ('alphabetical', 'curated'):
                raise ValueError("default_sort_order must be 'alphabetical' or 'curated'")
            collection.default_sort_order = default_sort_order
        if default_show_jump_to_bar is not None:
            collection.default_show_jump_to_bar = default_show_jump_to_bar
        if default_jump_button_type is not None:
            if default_jump_button_type not in ('letter-ranges', 'number-ranges', 'sections'):
                raise ValueError("default_jump_button_type must be 'letter-ranges', 'number-ranges', or 'sections'")
            collection.default_jump_button_type = default_jump_button_type
        if default_show_color_coding is not None:
            collection.default_show_color_coding = default_show_color_coding
        if default_show_card_background is not None:
            collection.default_show_card_background = default_show_card_background
        if default_edit_mode is not None:
            collection.default_edit_mode = default_edit_mode
        if default_crossfade_seconds is not None:
            if not (0 <= default_crossfade_seconds <= 12):
                raise ValueError("default_crossfade_seconds must be between 0 and 12")
            collection.default_crossfade_seconds = default_crossfade_seconds
        if default_hit_button_mode is not None:
            valid_modes = ('favorites', 'favorites-and-recommended', 'any', 'prioritize-section')
            if default_hit_button_mode not in valid_modes:
                raise ValueError(f"default_hit_button_mode must be one of {valid_modes}")
            collection.default_hit_button_mode = default_hit_button_mode
        self.db.commit()
        logger.info(f"Updated settings for collection: {collection.name}")
        return collection

    def delete_collection(self, collection_id: str) -> bool:
        """
        Delete a collection
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            True if deleted, False if not found
        """
        collection = self.db.query(Collection).filter(Collection.id == collection_id).first()
        if collection:
            self.db.delete(collection)
            self.db.commit()
            logger.info(f"Deleted collection: {collection.name}")
            return True
        return False
    
    
    def _calculate_enabled_tracks(self, album: Album, enabled_tracks: List, disabled_tracks: List) -> List[str]:
        """
        Calculate which tracks should be enabled for an album in a collection
        
        Args:
            album: Album instance
            enabled_tracks: List of enabled track numbers or ['all']
            disabled_tracks: List of disabled track numbers
            
        Returns:
            List of enabled track IDs
        """
        # Get all tracks for this album
        tracks = self.db.query(Track).filter(Track.album_id == album.id).order_by(
            Track.disc_number, Track.track_number
        ).all()
        
        if not tracks:
            return []
        
        # If enabled_tracks is ['all'], enable all tracks except disabled ones
        if enabled_tracks == ['all'] or 'all' in enabled_tracks:
            return [track.id for track in tracks if track.track_number not in disabled_tracks]
        
        # Otherwise, only enable specified tracks
        return [track.id for track in tracks if track.track_number in enabled_tracks]
    
    def recalculate_display_numbers(self, collection_id: str):
        """
        Recalculate display numbers for all albums in a collection based on sort_order
        
        Args:
            collection_id: Collection UUID
        """
        # Get all collection albums ordered by sort_order (tie-break by id for stability)
        collection_albums = self.db.query(CollectionAlbum).filter(
            CollectionAlbum.collection_id == collection_id
        ).order_by(CollectionAlbum.sort_order, CollectionAlbum.id).all()
        
        # Assign sequential display numbers starting from 1
        for index, collection_album in enumerate(collection_albums, start=1):
            collection_album.display_number = index
        
        logger.info(f"Recalculated display numbers for collection {collection_id}: {len(collection_albums)} albums")
    
    def get_collection_by_slug(self, slug: str, user_id: str = None) -> Optional[Collection]:
        """
        Get collection by slug filtered by the active source mode.
        If user_id given, match by (user_id, slug, source); else legacy global slug (single owner).
        """
        active_source = 'local' if settings.enable_local_library else 'spotify'
        if user_id is not None:
            return self.db.query(Collection).filter(
                Collection.user_id == user_id,
                Collection.slug == slug,
                Collection.source == active_source,
            ).first()
        return self.db.query(Collection).filter(
            Collection.slug == slug,
            Collection.source == active_source,
        ).first()

    def get_collection_by_user_slug_and_collection_slug(self, user_slug: str, collection_slug: str) -> Optional[Collection]:
        """Get collection by owner's user slug and collection slug, filtered by active source mode."""
        from app.models.user import User
        active_source = 'local' if settings.enable_local_library else 'spotify'
        user = self.db.query(User).filter(User.slug == user_slug).first()
        if not user:
            return None
        return self.db.query(Collection).filter(
            Collection.user_id == user.id,
            Collection.slug == collection_slug,
            Collection.source == active_source,
        ).first()

    def get_all_collections(self, user_id: str = None) -> List[Collection]:
        """
        Get collections filtered by active source mode (local vs spotify).
        The virtual 'all' collection (slug='all') is excluded — it is handled specially by the API layer.
        """
        active_source = 'local' if settings.enable_local_library else 'spotify'
        q = self.db.query(Collection).filter(
            Collection.is_active == True,
            Collection.slug != 'all',
            Collection.source == active_source,
        )
        if user_id is not None:
            q = q.filter(Collection.user_id == user_id)
        return q.all()

    def get_collections_for_user_slug(self, user_slug: str, include_private: bool = False) -> List[Collection]:
        """Get collections for public jukebox listing, filtered by active source mode.
        The virtual 'all' collection is excluded — callers that need it handle it separately."""
        from app.models.user import User
        active_source = 'local' if settings.enable_local_library else 'spotify'
        user = self.db.query(User).filter(User.slug == user_slug).first()
        if not user:
            return []
        q = self.db.query(Collection).filter(
            Collection.user_id == user.id,
            Collection.is_active == True,
            Collection.slug != 'all',
            Collection.source == active_source,
        )
        if not include_private:
            q = q.filter(Collection.published == True)
        return q.order_by(Collection.name).all()
    
    def get_collection_albums(self, collection_id: str, include_tracks: bool = False, only_spotify: bool = False) -> List[dict]:
        """
        Get all albums in a collection with display numbers.
        
        Args:
            collection_id: Collection UUID
            include_tracks: Whether to include track information
            only_spotify: When True, only include albums that have spotify_id (for cloud-only mode)
            
        Returns:
            List of album dictionaries with display numbers
        """
        collection_albums = self.db.query(CollectionAlbum).filter(
            CollectionAlbum.collection_id == collection_id
        ).order_by(CollectionAlbum.display_number).all()
        
        result = []
        for ca in collection_albums:
            if not ca.album or ca.album.archived:
                continue
            if only_spotify and not getattr(ca.album, "spotify_id", None):
                continue
            
            album_dict = {
                'id': ca.album.id,
                'display_number': ca.display_number,
                'title': ca.album.title,
                'artist': ca.album.artist,
                'cover_art_path': ca.album.custom_cover_art_path or ca.album.cover_art_path,
                'spotify_image_url': getattr(ca.album, 'spotify_image_url', None),
                'year': ca.album.year,
                'total_tracks': ca.album.total_tracks,
                'has_multi_disc': ca.album.has_multi_disc,
                'various_artists': ca.album.various_artists,
                'is_playlist': getattr(ca.album, 'is_playlist', False),
            }
            
            if include_tracks:
                # Get enabled tracks for this collection (visible in UI; can be selected individually)
                # Exclude archived so they never appear or get added when adding whole album
                enabled_track_ids = set(ca.enabled_track_ids)
                tracks = self.db.query(Track).filter(
                    and_(
                        Track.album_id == ca.album.id,
                        Track.id.in_(enabled_track_ids),
                        Track.enabled == True,  # Respect global track enabled setting
                        Track.archived == False  # Archived tracks hidden and excluded from queue
                    )
                ).order_by(Track.disc_number, Track.track_number).all()
                
                album_dict['tracks'] = [
                    {
                        'id': track.id,
                        'disc_number': track.disc_number,
                        'track_number': track.track_number,
                        'title': track.title,
                        'artist': track.artist,
                        'duration_ms': track.duration_ms,
                        'is_favorite': track.is_favorite,
                    }
                    for track in tracks
                ]
            
            result.append(album_dict)
        
        return result

    def get_selection_for_track(self, collection_id: str, track_id: str) -> Optional[tuple]:
        """
        Get (album_display_number, track_display_number_1based) for a track in a collection.
        Returns None if track is not in the collection or not found.
        """
        track = self.db.query(Track).filter(Track.id == track_id).first()
        if not track or not track.album_id:
            return None
        ca = self.db.query(CollectionAlbum).filter(
            CollectionAlbum.collection_id == collection_id,
            CollectionAlbum.album_id == track.album_id,
        ).first()
        if not ca or not ca.album or ca.album.archived:
            return None
        enabled_ids = set(ca.enabled_track_ids or [])
        if track_id not in enabled_ids:
            return None
        tracks = self.db.query(Track).filter(
            and_(
                Track.album_id == track.album_id,
                Track.id.in_(enabled_ids),
                Track.enabled == True,
            )
        ).order_by(Track.disc_number, Track.track_number).all()
        for i, t in enumerate(tracks):
            if t.id == track_id:
                return (ca.display_number, i + 1)
        return None

    def add_album_to_collection(self, collection_id: str, album_id: str, sort_order: int = None) -> Optional[CollectionAlbum]:
        """
        Add an album to a collection
        
        Args:
            collection_id: Collection UUID
            album_id: Album UUID
            sort_order: Sort order (defaults to end of list)
            
        Returns:
            CollectionAlbum instance or None on error
        """
        # Check if already exists
        existing = self.db.query(CollectionAlbum).filter(
            and_(
                CollectionAlbum.collection_id == collection_id,
                CollectionAlbum.album_id == album_id
            )
        ).first()
        
        if existing:
            logger.warning(f"Album {album_id} already in collection {collection_id}")
            return existing
        
        # Get album to enable all tracks by default
        album = self.db.query(Album).filter(Album.id == album_id).first()
        if not album:
            logger.error(f"Album not found: {album_id}")
            return None
        
        # Get all track IDs for this album
        track_ids = [track.id for track in album.tracks]
        
        # Determine sort order
        if sort_order is None:
            max_order = self.db.query(CollectionAlbum).filter(
                CollectionAlbum.collection_id == collection_id
            ).count()
            sort_order = max_order + 1
        
        # Create collection album
        collection_album = CollectionAlbum(
            collection_id=collection_id,
            album_id=album_id,
            sort_order=sort_order,
            display_number=0,  # Will be recalculated
            enabled_track_ids=track_ids
        )
        
        self.db.add(collection_album)
        self.db.flush()
        
        # Recalculate display numbers
        self.recalculate_display_numbers(collection_id)
        self.db.commit()
        
        return collection_album
    
    def remove_album_from_collection(self, collection_id: str, album_id: str) -> bool:
        """
        Remove an album from a collection
        
        Args:
            collection_id: Collection UUID
            album_id: Album UUID
            
        Returns:
            True if removed, False if not found
        """
        collection_album = self.db.query(CollectionAlbum).filter(
            and_(
                CollectionAlbum.collection_id == collection_id,
                CollectionAlbum.album_id == album_id
            )
        ).first()
        
        if collection_album:
            self.db.delete(collection_album)
            self.recalculate_display_numbers(collection_id)
            self.db.commit()
            return True
        
        return False
    
    def update_album_sort_order(self, collection_id: str, album_id: str, new_sort_order: int) -> bool:
        """
        Update sort order for an album in a collection
        
        Args:
            collection_id: Collection UUID
            album_id: Album UUID
            new_sort_order: New sort order value
            
        Returns:
            True if updated, False if not found
        """
        collection_album = self.db.query(CollectionAlbum).filter(
            and_(
                CollectionAlbum.collection_id == collection_id,
                CollectionAlbum.album_id == album_id
            )
        ).first()
        
        if collection_album:
            collection_album.sort_order = new_sort_order
            self.recalculate_display_numbers(collection_id)
            self.db.commit()
            return True
        
        return False
    
    def set_collection_album_order(self, collection_id: str, album_ids: list[str]) -> bool:
        """
        Set the full order of albums in a collection by a list of album IDs.
        Each album in the list must belong to the collection. Order is 0-based index → sort_order.
        Recalculates display_number after updating.
        """
        if not album_ids:
            return True
        collection_albums = {
            ca.album_id: ca
            for ca in self.db.query(CollectionAlbum).filter(
                CollectionAlbum.collection_id == collection_id,
                CollectionAlbum.album_id.in_(album_ids),
            ).all()
        }
        if len(collection_albums) != len(album_ids):
            # Duplicate or unknown album_id in list
            return False
        for index, album_id in enumerate(album_ids):
            collection_albums[album_id].sort_order = index
        self.db.flush()  # ensure sort_order is visible to the next query
        self.recalculate_display_numbers(collection_id)
        self.db.commit()
        return True
