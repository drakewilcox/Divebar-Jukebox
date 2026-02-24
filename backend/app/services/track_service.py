"""Track service for managing track operations"""
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
import logging

from app.models.track import Track
from app.models.album import Album
from app.config import settings

logger = logging.getLogger(__name__)


class TrackService:
    """Service for track-related operations"""
    
    def __init__(self, db: Session):
        """
        Initialize track service
        
        Args:
            db: Database session
        """
        self.db = db
        self.library_path = Path(settings.music_library_path)
    
    def get_track_by_id(self, track_id: str) -> Optional[Track]:
        """
        Get track by ID
        
        Args:
            track_id: Track UUID
            
        Returns:
            Track instance or None
        """
        return self.db.query(Track).filter(Track.id == track_id).first()
    
    def get_tracks_by_album(self, album_id: str, enabled_only: bool = True) -> List[Track]:
        """
        Get all tracks for an album
        
        Args:
            album_id: Album UUID
            enabled_only: If True, only return enabled tracks (default: True)
            
        Returns:
            List of Track instances
        """
        query = self.db.query(Track).filter(Track.album_id == album_id)
        
        if enabled_only:
            query = query.filter(Track.enabled == True, Track.archived == False)
        
        return query.order_by(Track.disc_number, Track.track_number).all()
    
    def get_track_file_path(self, track_id: str) -> Optional[Path]:
        """
        Get full filesystem path to track's FLAC file
        
        Args:
            track_id: Track UUID
            
        Returns:
            Full path to FLAC file or None if not found
        """
        track = self.get_track_by_id(track_id)
        if not track:
            return None
        
        full_path = self.library_path / track.file_path
        
        if not full_path.exists():
            logger.error(f"Track file not found: {full_path}")
            return None
        
        return full_path
    
    def toggle_track_enabled(self, track_id: str) -> Optional[Track]:
        """
        Toggle track enabled status
        
        Args:
            track_id: Track UUID
            
        Returns:
            Updated Track instance or None if not found
        """
        track = self.get_track_by_id(track_id)
        if track:
            track.enabled = not track.enabled
            self.db.commit()
            return track
        return None
    
    def search_tracks(self, query: str, limit: int = 50) -> List[Track]:
        """
        Search tracks by title or artist
        
        Args:
            query: Search query
            limit: Maximum number of results
            
        Returns:
            List of matching Track instances
        """
        search_pattern = f"%{query}%"
        return self.db.query(Track).filter(
            (Track.title.ilike(search_pattern)) | 
            (Track.artist.ilike(search_pattern))
        ).limit(limit).all()
