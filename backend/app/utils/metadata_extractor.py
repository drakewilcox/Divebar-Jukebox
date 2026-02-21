"""FLAC metadata extraction utilities"""
import os
import re
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from mutagen.flac import FLAC
from mutagen.id3 import ID3, APIC
from PIL import Image
import io
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def sanitize_track_title(title: str) -> str:
    """
    Sanitize track title by removing remaster annotations
    
    Removes parentheses that contain 'remaster' or 'remastered' text,
    such as "(2014 Remaster)", "(Remastered 2002)", "(2021 Remaster)", etc.
    
    Args:
        title: Original track title
        
    Returns:
        Sanitized track title with remaster annotations removed
    """
    # Pattern matches parentheses containing 'remaster' or 'remastered' (case-insensitive)
    # Example matches: "(2014 Remaster)", "(Remastered 2002)", "(2001 Remastered Version)"
    pattern = r'\s*\([^)]*remaster[^)]*\)'
    sanitized = re.sub(pattern, '', title, flags=re.IGNORECASE)
    
    # Clean up any extra whitespace
    sanitized = ' '.join(sanitized.split())
    
    return sanitized.strip()


class MetadataExtractor:
    """Extract metadata from FLAC files and album directories"""
    
    def __init__(self, library_path: str = None):
        """
        Initialize metadata extractor
        
        Args:
            library_path: Path to music library root (defaults to settings)
        """
        self.library_path = Path(library_path or settings.music_library_path)
        
    def scan_library(self) -> List[Dict[str, Any]]:
        """
        Scan the entire music library for albums
        
        Returns:
            List of album dictionaries with metadata
        """
        albums = []
        
        if not self.library_path.exists():
            logger.error(f"Music library path does not exist: {self.library_path}")
            return albums
        
        # Walk through Artist/Album structure
        for artist_dir in self.library_path.iterdir():
            if not artist_dir.is_dir() or artist_dir.name.startswith('.'):
                continue
                
            for album_dir in artist_dir.iterdir():
                if not album_dir.is_dir() or album_dir.name.startswith('.'):
                    continue
                
                try:
                    album_metadata = self.extract_album_metadata(album_dir)
                    if album_metadata:
                        albums.append(album_metadata)
                        logger.info(f"Found album: {album_metadata['artist']} - {album_metadata['title']}")
                except Exception as e:
                    logger.error(f"Error processing album {album_dir}: {e}")
        
        return albums
    
    def extract_album_metadata(self, album_path: Path) -> Optional[Dict[str, Any]]:
        """
        Extract metadata for an entire album
        
        Args:
            album_path: Path to album directory
            
        Returns:
            Dictionary with album metadata or None if no FLAC files found
        """
        # Get relative path from library root
        relative_path = str(album_path.relative_to(self.library_path))
        
        # Check if multi-disc album
        has_multi_disc, disc_dirs = self.detect_multi_disc(album_path)
        
        # Collect all FLAC files
        flac_files = []
        if has_multi_disc:
            for disc_dir in disc_dirs:
                flac_files.extend(sorted(disc_dir.glob("*.flac")))
        else:
            flac_files = sorted(album_path.glob("*.flac"))
        
        if not flac_files:
            logger.warning(f"No FLAC files found in {album_path}")
            return None
        
        # Extract metadata from first track to get album info
        first_track = FLAC(str(flac_files[0]))
        
        album_title = first_track.get('album', [album_path.name])[0]
        album_artist = first_track.get('albumartist', first_track.get('artist', [album_path.parent.name]))[0]
        year = first_track.get('date', [None])[0]
        
        # Try to parse year if it's a full date
        if year and len(str(year)) > 4:
            year = str(year)[:4]
        try:
            year = int(year) if year else None
        except (ValueError, TypeError):
            year = None
        
        # Find cover art
        cover_art_path = self.extract_cover_art(album_path, flac_files[0])
        
        # Genre from first track (FLAC/Vorbis: can be multiple values)
        genre_raw = first_track.get('genre', [])
        genres = [g.strip() for g in genre_raw if g and str(g).strip()] if genre_raw else []
        
        # Extract all tracks
        tracks = []
        for flac_file in flac_files:
            track_metadata = self.extract_track_metadata(flac_file, album_path)
            if track_metadata:
                tracks.append(track_metadata)
        
        extra = {
            'disc_count': len(disc_dirs) if has_multi_disc else 1,
        }
        if genres:
            extra['genre'] = genres
        
        return {
            'file_path': relative_path,
            'title': album_title,
            'artist': album_artist,
            'cover_art_path': cover_art_path,
            'total_tracks': len(tracks),
            'year': year,
            'has_multi_disc': has_multi_disc,
            'extra_metadata': extra,
            'tracks': tracks
        }
    
    def extract_track_metadata(self, track_path: Path, album_path: Path) -> Optional[Dict[str, Any]]:
        """
        Extract metadata from a single FLAC file
        
        Args:
            track_path: Path to FLAC file
            album_path: Path to album directory (for relative path calculation)
            
        Returns:
            Dictionary with track metadata or None on error
        """
        try:
            audio = FLAC(str(track_path))
            
            # Get relative path from library root
            relative_file_path = str(track_path.relative_to(self.library_path))
            
            # Determine disc number
            disc_number = 1
            if 'Disc' in str(track_path.parent.name) or 'Disk' in str(track_path.parent.name):
                # Extract disc number from folder name (e.g., "Disc 1" or "Disc 2")
                disc_folder = track_path.parent.name
                for word in disc_folder.split():
                    if word.isdigit():
                        disc_number = int(word)
                        break
            
            # Try to get disc number from metadata
            if 'discnumber' in audio:
                try:
                    disc_num_str = str(audio['discnumber'][0])
                    # Handle formats like "1/2" or just "1"
                    if '/' in disc_num_str:
                        disc_number = int(disc_num_str.split('/')[0])
                    else:
                        disc_number = int(disc_num_str)
                except (ValueError, IndexError):
                    pass
            
            # Get track number
            track_number = 0
            if 'tracknumber' in audio:
                try:
                    track_num_str = str(audio['tracknumber'][0])
                    # Handle formats like "1/12" or just "1"
                    if '/' in track_num_str:
                        track_number = int(track_num_str.split('/')[0])
                    else:
                        track_number = int(track_num_str)
                except (ValueError, IndexError):
                    pass
            
            title = audio.get('title', [track_path.stem])[0]
            # Sanitize title to remove remaster annotations
            title = sanitize_track_title(title)
            artist = audio.get('artist', ['Unknown'])[0]
            
            # Duration in milliseconds
            duration_ms = int(audio.info.length * 1000) if audio.info else 0

            # ReplayGain: normalize playback loudness (e.g. "-5.23 dB" or "-2.09")
            def parse_replaygain(val):
                if val is None:
                    return None
                s = str(val).strip().upper().rstrip('DB').strip()
                try:
                    return float(s)
                except (ValueError, TypeError):
                    return None

            replaygain_track_db = None
            replaygain_album_db = None
            if 'REPLAYGAIN_TRACK_GAIN' in audio:
                try:
                    replaygain_track_db = parse_replaygain(audio['REPLAYGAIN_TRACK_GAIN'][0])
                except (ValueError, IndexError, TypeError):
                    pass
            if 'REPLAYGAIN_ALBUM_GAIN' in audio:
                try:
                    replaygain_album_db = parse_replaygain(audio['REPLAYGAIN_ALBUM_GAIN'][0])
                except (ValueError, IndexError, TypeError):
                    pass

            extra = {
                'bitrate': audio.info.bitrate if audio.info else 0,
                'sample_rate': audio.info.sample_rate if audio.info else 0,
                'channels': audio.info.channels if audio.info else 0,
            }
            if replaygain_track_db is not None:
                extra['replaygain_track_gain'] = replaygain_track_db
            if replaygain_album_db is not None:
                extra['replaygain_album_gain'] = replaygain_album_db

            return {
                'file_path': relative_file_path,
                'disc_number': disc_number,
                'track_number': track_number,
                'title': title,
                'artist': artist,
                'duration_ms': duration_ms,
                'extra_metadata': extra,
            }
        except Exception as e:
            logger.error(f"Error extracting track metadata from {track_path}: {e}")
            return None
    
    def detect_multi_disc(self, album_path: Path) -> Tuple[bool, List[Path]]:
        """
        Check if album has multiple discs
        
        Args:
            album_path: Path to album directory
            
        Returns:
            Tuple of (has_multi_disc, list of disc directories)
        """
        disc_dirs = []
        
        for item in album_path.iterdir():
            if item.is_dir() and ('Disc' in item.name or 'Disk' in item.name or 'CD' in item.name):
                # Check if directory contains FLAC files
                if list(item.glob("*.flac")):
                    disc_dirs.append(item)
        
        disc_dirs.sort(key=lambda x: x.name)
        return len(disc_dirs) > 0, disc_dirs
    
    def extract_cover_art(self, album_path: Path, sample_track: Path) -> Optional[str]:
        """
        Extract cover art from album directory or embedded in FLAC
        
        Args:
            album_path: Path to album directory
            sample_track: Path to a sample FLAC file to extract embedded art
            
        Returns:
            Relative path to cover art or None
        """
        # Check for common cover art filenames in album directory
        cover_names = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 
                       'front.jpg', 'front.png', 'album.jpg', 'album.png']
        
        # First check in album directory
        for cover_name in cover_names:
            cover_path = album_path / cover_name
            if cover_path.exists():
                return str(cover_path.relative_to(self.library_path))
        
        # Check in ARTWORK subdirectory (as seen in your library)
        artwork_dir = album_path / 'ARTWORK'
        if artwork_dir.exists():
            for cover_file in artwork_dir.glob('*'):
                if cover_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    return str(cover_file.relative_to(self.library_path))
        
        # Try to extract embedded cover art from FLAC
        try:
            audio = FLAC(str(sample_track))
            if audio.pictures:
                # Save embedded cover art
                picture = audio.pictures[0]
                cover_filename = 'cover.jpg'
                cover_path = album_path / cover_filename
                
                with open(cover_path, 'wb') as f:
                    f.write(picture.data)
                
                return str(cover_path.relative_to(self.library_path))
        except Exception as e:
            logger.warning(f"Could not extract embedded cover art from {sample_track}: {e}")
        
        return None
    
    def create_thumbnail(self, image_path: Path, thumbnail_path: Path, size: Tuple[int, int] = (300, 300)) -> bool:
        """
        Create a thumbnail from an image
        
        Args:
            image_path: Path to source image
            thumbnail_path: Path to save thumbnail
            size: Thumbnail size (width, height)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with Image.open(image_path) as img:
                img.thumbnail(size, Image.Resampling.LANCZOS)
                img.save(thumbnail_path, "JPEG", quality=85)
            return True
        except Exception as e:
            logger.error(f"Error creating thumbnail: {e}")
            return False
