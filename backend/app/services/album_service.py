"""Album service for managing album operations"""
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.models.album import Album
from app.models.track import Track
from app.utils.metadata_extractor import MetadataExtractor

logger = logging.getLogger(__name__)


class AlbumService:
    """Service for album-related operations"""
    
    def __init__(self, db: Session):
        """
        Initialize album service
        
        Args:
            db: Database session
        """
        self.db = db
        self.metadata_extractor = MetadataExtractor()
    
    def scan_and_import_library(self) -> dict:
        """
        Scan music library and import all albums
        
        Returns:
            Dictionary with scan results (counts, errors, etc.)
        """
        logger.info("Starting library scan...")
        
        results = {
            'albums_found': 0,
            'albums_imported': 0,
            'albums_updated': 0,
            'albums_already_exist': 0,
            'albums_skipped': 0,
            'tracks_imported': 0,
            'errors': []
        }
        
        try:
            albums_data = self.metadata_extractor.scan_library()
            results['albums_found'] = len(albums_data)
            
            for album_data in albums_data:
                try:
                    # Match by file_path only (user may have edited title/artist in DB)
                    existing_album = self.db.query(Album).filter(
                        Album.file_path == album_data['file_path']
                    ).first()
                    
                    if existing_album:
                        # Skip: do not overwrite user-edited metadata or custom track settings
                        results['albums_already_exist'] += 1
                        logger.debug(f"Already in library (skipped): {album_data['file_path']}")
                    else:
                        # New album: import
                        self._create_album_from_data(album_data)
                        results['albums_imported'] += 1
                        results['tracks_imported'] += len(album_data.get('tracks', []))
                        logger.info(f"Imported album: {album_data['artist']} - {album_data['title']}")
                    
                except Exception as e:
                    error_msg = f"Error importing album {album_data.get('file_path')}: {str(e)}"
                    logger.error(error_msg)
                    results['errors'].append(error_msg)
                    results['albums_skipped'] += 1
            
            self.db.commit()
            logger.info(f"Library scan complete: {results}")
            
        except Exception as e:
            self.db.rollback()
            error_msg = f"Library scan failed: {str(e)}"
            logger.error(error_msg)
            results['errors'].append(error_msg)
        
        return results
    
    def _create_album_from_data(self, album_data: dict) -> Album:
        """
        Create a new album from metadata
        
        Args:
            album_data: Album metadata dictionary
            
        Returns:
            Created Album instance
        """
        # Create album
        album = Album(
            file_path=album_data['file_path'],
            title=album_data['title'],
            artist=album_data['artist'],
            cover_art_path=album_data.get('cover_art_path'),
            total_tracks=album_data['total_tracks'],
            year=album_data.get('year'),
            has_multi_disc=album_data['has_multi_disc'],
            extra_metadata=album_data.get('extra_metadata', {})
        )
        
        self.db.add(album)
        self.db.flush()  # Get the album ID
        
        # Create tracks
        for track_data in album_data.get('tracks', []):
            track = Track(
                album_id=album.id,
                file_path=track_data['file_path'],
                disc_number=track_data['disc_number'],
                track_number=track_data['track_number'],
                title=track_data['title'],
                artist=track_data['artist'],
                duration_ms=track_data['duration_ms'],
                extra_metadata=track_data.get('extra_metadata', {})
            )
            self.db.add(track)
        
        return album
    
    def _update_album_from_data(self, album: Album, album_data: dict) -> Album:
        """
        Update existing album with new metadata
        
        Args:
            album: Existing Album instance
            album_data: New album metadata
            
        Returns:
            Updated Album instance
        """
        # Update album fields
        album.title = album_data['title']
        album.artist = album_data['artist']
        album.cover_art_path = album_data.get('cover_art_path')
        album.total_tracks = album_data['total_tracks']
        album.year = album_data.get('year')
        album.has_multi_disc = album_data['has_multi_disc']
        album.extra_metadata = album_data.get('extra_metadata', {})
        
        # Delete existing tracks
        self.db.query(Track).filter(Track.album_id == album.id).delete()
        
        # Create new tracks
        for track_data in album_data.get('tracks', []):
            track = Track(
                album_id=album.id,
                file_path=track_data['file_path'],
                disc_number=track_data['disc_number'],
                track_number=track_data['track_number'],
                title=track_data['title'],
                artist=track_data['artist'],
                duration_ms=track_data['duration_ms'],
                extra_metadata=track_data.get('extra_metadata', {})
            )
            self.db.add(track)
        
        return album
    
    def get_album_by_id(self, album_id: str) -> Optional[Album]:
        """
        Get album by ID
        
        Args:
            album_id: Album UUID
            
        Returns:
            Album instance or None
        """
        return self.db.query(Album).filter(Album.id == album_id).first()
    
    def get_album_by_path(self, file_path: str) -> Optional[Album]:
        """
        Get album by file path
        
        Args:
            file_path: Relative file path
            
        Returns:
            Album instance or None
        """
        return self.db.query(Album).filter(Album.file_path == file_path).first()
    
    def get_all_albums(self, limit: int = 1000, offset: int = 0) -> List[Album]:
        """
        Get all albums with pagination
        
        Args:
            limit: Maximum number of albums to return
            offset: Number of albums to skip
            
        Returns:
            List of Album instances
        """
        return self.db.query(Album).order_by(Album.artist, Album.title).limit(limit).offset(offset).all()
    
    def delete_album(self, album_id: str) -> bool:
        """
        Delete album by ID
        
        Args:
            album_id: Album UUID
            
        Returns:
            True if deleted, False if not found
        """
        album = self.get_album_by_id(album_id)
        if album:
            self.db.delete(album)
            self.db.commit()
            return True
        return False
