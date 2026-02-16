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
    
    def create_collection(self, name: str, slug: str, description: str = None) -> Collection:
        """
        Create a new collection
        
        Args:
            name: Collection display name
            slug: URL-safe slug
            description: Optional description
            
        Returns:
            Created Collection instance
        """
        # Check if slug already exists
        existing = self.db.query(Collection).filter(Collection.slug == slug).first()
        if existing:
            raise ValueError(f"Collection with slug '{slug}' already exists")
        
        collection = Collection(
            name=name,
            slug=slug,
            description=description,
            is_active=True
        )
        
        self.db.add(collection)
        self.db.commit()
        
        logger.info(f"Created collection: {name} ({slug})")
        return collection
    
    def update_collection(self, collection_id: str, name: str = None, description: str = None, is_active: bool = None) -> Optional[Collection]:
        """
        Update a collection
        
        Args:
            collection_id: Collection UUID
            name: New name (optional)
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
        if description is not None:
            collection.description = description
        if is_active is not None:
            collection.is_active = is_active
        
        self.db.commit()
        logger.info(f"Updated collection: {collection.name}")
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
        # Get all collection albums ordered by sort_order
        collection_albums = self.db.query(CollectionAlbum).filter(
            CollectionAlbum.collection_id == collection_id
        ).order_by(CollectionAlbum.sort_order).all()
        
        # Assign sequential display numbers starting from 1
        for index, collection_album in enumerate(collection_albums, start=1):
            collection_album.display_number = index
        
        logger.info(f"Recalculated display numbers for collection {collection_id}: {len(collection_albums)} albums")
    
    def get_collection_by_slug(self, slug: str) -> Optional[Collection]:
        """
        Get collection by slug
        
        Args:
            slug: Collection slug
            
        Returns:
            Collection instance or None
        """
        return self.db.query(Collection).filter(Collection.slug == slug).first()
    
    def get_all_collections(self) -> List[Collection]:
        """
        Get all active collections
        
        Returns:
            List of Collection instances
        """
        return self.db.query(Collection).filter(Collection.is_active == True).all()
    
    def get_collection_albums(self, collection_id: str, include_tracks: bool = False) -> List[dict]:
        """
        Get all albums in a collection with display numbers
        
        Args:
            collection_id: Collection UUID
            include_tracks: Whether to include track information
            
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
            
            album_dict = {
                'id': ca.album.id,
                'display_number': ca.display_number,
                'title': ca.album.title,
                'artist': ca.album.artist,
                'cover_art_path': ca.album.cover_art_path,
                'year': ca.album.year,
                'total_tracks': ca.album.total_tracks,
                'has_multi_disc': ca.album.has_multi_disc,
            }
            
            if include_tracks:
                # Get enabled tracks for this collection
                # Filter by both collection-specific inclusion AND global Track.enabled
                enabled_track_ids = set(ca.enabled_track_ids)
                tracks = self.db.query(Track).filter(
                    and_(
                        Track.album_id == ca.album.id,
                        Track.id.in_(enabled_track_ids),
                        Track.enabled == True  # Respect global track enabled setting
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
                    }
                    for track in tracks
                ]
            
            result.append(album_dict)
        
        return result
    
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
