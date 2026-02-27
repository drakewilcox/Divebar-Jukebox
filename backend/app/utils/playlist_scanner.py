"""Scan local Playlists folder and build album-like metadata for import."""
from pathlib import Path
from typing import Any, Dict, List, Optional
import logging

from mutagen.flac import FLAC
from mutagen.mp3 import MP3
from mutagen.id3 import ID3

from app.config import settings

logger = logging.getLogger(__name__)

# Audio extensions we support in playlist folders
AUDIO_EXTENSIONS = {".flac", ".mp3"}


def _get_playlists_root() -> Path:
    return Path(settings.resolved_playlists_path)


def _extract_track_metadata_flac(track_path: Path, playlists_root: Path) -> Optional[Dict[str, Any]]:
    try:
        audio = FLAC(str(track_path))
        relative_file_path = str(track_path.relative_to(playlists_root))
        title = audio.get("title", [track_path.stem])[0]
        artist = audio.get("artist", ["Unknown"])[0]
        duration_ms = int(audio.info.length * 1000) if audio.info else 0
        return {
            "file_path": relative_file_path,
            "disc_number": 1,
            "track_number": 0,  # Will be set by caller from order
            "title": title,
            "artist": artist,
            "duration_ms": duration_ms,
            "extra_metadata": {},
        }
    except Exception as e:
        logger.warning("Error reading FLAC %s: %s", track_path, e)
        return None


def _extract_track_metadata_mp3(track_path: Path, playlists_root: Path) -> Optional[Dict[str, Any]]:
    try:
        audio = MP3(str(track_path))
        relative_file_path = str(track_path.relative_to(playlists_root))
        title = track_path.stem
        artist = "Unknown"
        if audio.tags and isinstance(audio.tags, ID3):
            if "TIT2" in audio.tags:
                title = str(audio.tags["TIT2"].text[0]) if audio.tags["TIT2"].text else track_path.stem
            if "TPE1" in audio.tags and audio.tags["TPE1"].text:
                artist = str(audio.tags["TPE1"].text[0])
        duration_ms = int(audio.info.length * 1000) if audio.info else 0
        return {
            "file_path": relative_file_path,
            "disc_number": 1,
            "track_number": 0,
            "title": title,
            "artist": artist,
            "duration_ms": duration_ms,
            "extra_metadata": {},
        }
    except Exception as e:
        logger.warning("Error reading MP3 %s: %s", track_path, e)
        return None


def _extract_track_metadata(track_path: Path, playlists_root: Path) -> Optional[Dict[str, Any]]:
    suffix = track_path.suffix.lower()
    if suffix == ".flac":
        return _extract_track_metadata_flac(track_path, playlists_root)
    if suffix == ".mp3":
        return _extract_track_metadata_mp3(track_path, playlists_root)
    return None


def scan_playlists() -> List[Dict[str, Any]]:
    """
    Scan the Playlists folder: each subfolder = one "album" (playlist).
    Returns list of album dicts compatible with AlbumService._create_album_from_data,
    with is_playlist=True, various_artists=True, artist="Various Artists".
    """
    playlists_root = _get_playlists_root()
    if not playlists_root.exists() or not playlists_root.is_dir():
        logger.error("Playlists path does not exist or is not a directory: %s", playlists_root)
        return []

    albums = []
    for playlist_dir in sorted(playlists_root.iterdir()):
        if not playlist_dir.is_dir() or playlist_dir.name.startswith("."):
            continue

        # Collect audio files (sorted by name for stable order)
        audio_files = []
        for p in playlist_dir.iterdir():
            if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS:
                audio_files.append(p)
        audio_files.sort(key=lambda p: p.name.lower())

        if not audio_files:
            logger.debug("Skipping playlist folder with no audio: %s", playlist_dir.name)
            continue

        # Cover: cover.jpg in folder
        cover_path = playlist_dir / "cover.jpg"
        if not cover_path.exists():
            cover_path = playlist_dir / "cover.png"
        cover_art_path = None
        if cover_path.exists():
            cover_art_path = str(cover_path.relative_to(playlists_root))

        # Build track list (file_path relative to playlists_root)
        tracks = []
        for i, audio_file in enumerate(audio_files, start=1):
            meta = _extract_track_metadata(audio_file, playlists_root)
            if meta:
                meta["track_number"] = i
                tracks.append(meta)

        if not tracks:
            logger.warning("No readable tracks in playlist: %s", playlist_dir.name)
            continue

        # file_path for album: folder name (relative to playlists_root) so paths resolve under playlists_path
        folder_name = playlist_dir.name
        album_data = {
            "file_path": folder_name,
            "title": folder_name,
            "artist": "Various Artists",
            "cover_art_path": cover_art_path,
            "total_tracks": len(tracks),
            "year": None,
            "has_multi_disc": False,
            "various_artists": True,
            "is_playlist": True,
            "description": None,
            "extra_metadata": {},
            "tracks": tracks,
        }
        albums.append(album_data)
        logger.info("Found playlist: %s (%d tracks)", folder_name, len(tracks))

    return albums
