"""Spotify API and token handling for admin: sync saved albums, add by URL."""
import re
import time
import logging
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import settings
from app.models.album import Album
from app.models.track import Track
from app.models.user_spotify_connection import UserSpotifyConnection

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_SAVED_ALBUMS_URL = "https://api.spotify.com/v1/me/albums"
SPOTIFY_ALBUM_URL = "https://api.spotify.com/v1/albums/{id}"
SPOTIFY_ALBUMS_BATCH_URL = "https://api.spotify.com/v1/albums"  # ?ids=id1,id2,... (max 20)
SPOTIFY_ALBUM_TRACKS_URL = "https://api.spotify.com/v1/albums/{id}/tracks"
SPOTIFY_PLAYLIST_URL = "https://api.spotify.com/v1/playlists/{id}"
SPOTIFY_PLAYLIST_TRACKS_URL = "https://api.spotify.com/v1/playlists/{id}/tracks"

# Spotify ID patterns
SPOTIFY_ALBUM_ID_RE = re.compile(r"(?:album[/:])?([a-zA-Z0-9]{22})")
SPOTIFY_PLAYLIST_ID_RE = re.compile(r"(?:playlist[/:])?([a-zA-Z0-9]{22})")

BATCH_SIZE = 20       # Spotify's max for the batch albums endpoint
MAX_RETRIES = 5       # Give up after this many 429s on a single request
MAX_RETRY_WAIT = 300  # Cap single wait at 5 min — honor Retry-After so we don't bail on long waits


class SpotifyRateLimitError(Exception):
    """Raised when Spotify rate-limits us beyond our max wait threshold."""


def _get_with_retry(client: httpx.Client, url: str, **kwargs) -> httpx.Response:
    """GET with automatic retry on 429. Waits up to MAX_RETRY_WAIT seconds per Retry-After.
    Raises SpotifyRateLimitError only if Spotify asks for longer than MAX_RETRY_WAIT or retries exhausted."""
    for attempt in range(MAX_RETRIES):
        resp = client.get(url, **kwargs)
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "5"))
            wait = min(retry_after + 1, MAX_RETRY_WAIT)
            if retry_after > MAX_RETRY_WAIT:
                raise SpotifyRateLimitError(
                    f"Spotify rate limit active — retry after {retry_after}s. "
                    "Please wait and try again later."
                )
            logger.warning("Spotify rate limit (429) — waiting %ds (attempt %d/%d)", wait, attempt + 1, MAX_RETRIES)
            time.sleep(wait)
            continue
        return resp
    raise SpotifyRateLimitError(
        f"Spotify rate limit hit {MAX_RETRIES} times in a row. Please wait and try again later."
    )


def fetch_albums_batch(access_token: str, spotify_album_ids: list[str]) -> list[dict[str, Any]]:
    """Fetch up to 20 album objects at once using the batch endpoint.
    Returns a list of album dicts (nulls filtered out)."""
    if not spotify_album_ids:
        return []
    ids_param = ",".join(spotify_album_ids[:BATCH_SIZE])
    with httpx.Client(timeout=20) as client:
        resp = _get_with_retry(
            client,
            SPOTIFY_ALBUMS_BATCH_URL,
            params={"ids": ids_param},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return [a for a in (resp.json().get("albums") or []) if a]


def _admin_redirect_uri() -> str:
    return f"{settings.frontend_url.rstrip('/')}/admin/spotify-callback"


def exchange_code_and_store(user_id: str, code: str, db: Session) -> bool:
    """Exchange authorization code for tokens and store for user. Returns True on success."""
    if not settings.spotify_client_id or not settings.spotify_client_secret:
        return False
    with httpx.Client() as client:
        resp = client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _admin_redirect_uri(),
            },
            auth=(settings.spotify_client_id, settings.spotify_client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
    if resp.status_code != 200:
        return False
    data = resp.json()
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    if not access_token or not refresh_token:
        return False
    expires_in = data.get("expires_in", 3600)
    expires_at = datetime.utcnow() + timedelta(seconds=int(expires_in) - 60)
    conn = db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == user_id).first()
    if conn:
        conn.access_token = access_token
        conn.refresh_token = refresh_token
        conn.expires_at = expires_at
    else:
        conn = UserSpotifyConnection(
            user_id=user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
        )
        db.add(conn)
    db.commit()
    return True


def _refresh_token(conn: UserSpotifyConnection, db: Session) -> str | None:
    """Refresh access token; update conn and return new access_token or None."""
    with httpx.Client() as client:
        resp = client.post(
            SPOTIFY_TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": conn.refresh_token},
            auth=(settings.spotify_client_id, settings.spotify_client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
    if resp.status_code != 200:
        return None
    data = resp.json()
    access_token = data.get("access_token")
    if access_token:
        conn.access_token = access_token
        expires_in = data.get("expires_in", 3600)
        conn.expires_at = datetime.utcnow() + timedelta(seconds=int(expires_in) - 60)
        db.commit()
    return access_token


def get_access_token(user_id: str, db: Session) -> str | None:
    """Return valid access token for user, refreshing proactively if expired or missing."""
    conn = db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == user_id).first()
    if not conn:
        return None
    # Proactively refresh if we know the token is expired (or has no expiry recorded)
    token_expired = (
        not conn.access_token
        or conn.expires_at is None
        or conn.expires_at <= datetime.utcnow()
    )
    if token_expired:
        return _refresh_token(conn, db)
    return conn.access_token


def is_connected(user_id: str, db: Session) -> bool:
    """Return True if user has a stored Spotify connection."""
    return db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == user_id).first() is not None


def fetch_saved_albums(access_token: str, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    """Fetch saved albums from Spotify (paginated). Returns API response dict."""
    with httpx.Client() as client:
        resp = client.get(
            SPOTIFY_SAVED_ALBUMS_URL,
            params={"limit": limit, "offset": offset},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
    resp.raise_for_status()
    return resp.json()


def fetch_all_saved_album_ids(access_token: str) -> list[str]:
    """Page through all of the user's saved Spotify albums and return every album ID.
    Uses the maximum page size (50) to minimise round-trips."""
    PAGE = 50
    ids: list[str] = []
    offset = 0
    with httpx.Client() as client:
        headers = {"Authorization": f"Bearer {access_token}"}
        while True:
            resp = client.get(
                SPOTIFY_SAVED_ALBUMS_URL,
                params={"limit": PAGE, "offset": offset},
                headers=headers,
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items") or []
            for it in items:
                album_id = (it.get("album") or {}).get("id")
                if album_id:
                    ids.append(album_id)
            total = data.get("total", 0)
            offset += PAGE
            if offset >= total:
                break
    return ids


def fetch_album(access_token: str, spotify_album_id: str) -> dict[str, Any]:
    """Fetch album metadata from Spotify."""
    with httpx.Client() as client:
        resp = client.get(
            SPOTIFY_ALBUM_URL.format(id=spotify_album_id),
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
    resp.raise_for_status()
    return resp.json()


def fetch_album_tracks(access_token: str, spotify_album_id: str) -> list[dict]:
    """Fetch all tracks for an album from Spotify (paginated, with rate-limit retry)."""
    out: list[dict] = []
    url = SPOTIFY_ALBUM_TRACKS_URL.format(id=spotify_album_id)
    offset = 0
    with httpx.Client(timeout=15) as client:
        while True:
            resp = _get_with_retry(
                client,
                url,
                params={"limit": 50, "offset": offset},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items") or []
            out.extend(items)
            if len(items) < 50:
                break
            offset += 50
            # Throttle between pagination pages (same rate as album loop)
            time.sleep(0.5)
    return out


def fetch_playlist(access_token: str, playlist_id: str) -> dict[str, Any]:
    """Fetch playlist metadata."""
    with httpx.Client() as client:
        resp = client.get(
            SPOTIFY_PLAYLIST_URL.format(id=playlist_id),
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
    resp.raise_for_status()
    return resp.json()


def fetch_playlist_tracks(access_token: str, playlist_id: str) -> list[dict]:
    """Fetch all tracks for a playlist (paginated)."""
    out: list[dict] = []
    url = SPOTIFY_PLAYLIST_TRACKS_URL.format(id=playlist_id)
    offset = 0
    with httpx.Client() as client:
        while True:
            resp = client.get(
                url,
                params={"limit": 100, "offset": offset},
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items") or []
            for it in items:
                t = it.get("track")
                if t and t.get("id"):
                    out.append(t)
            if len(items) < 100:
                break
            offset += 100
    return out


def parse_spotify_url(url: str) -> tuple[str, str] | None:
    """Return (type, id) e.g. ('album', 'xxx') or ('playlist', 'xxx') or None."""
    url = (url or "").strip()
    if "open.spotify.com" in url or "spotify.com" in url:
        if "/album/" in url:
            m = SPOTIFY_ALBUM_ID_RE.search(url)
            return ("album", m.group(1)) if m else None
        if "/playlist/" in url:
            m = SPOTIFY_PLAYLIST_ID_RE.search(url)
            return ("playlist", m.group(1)) if m else None
    return None


def _tracks_from_album_response(
    access_token: str,
    spotify_album_id: str,
    album_data: dict[str, Any] | None,
) -> list[dict]:
    """Get track list for an album. Uses album_data['tracks'] when the response already
    includes all tracks (e.g. from batch album fetch; first page is often enough).
    Only calls the tracks API when we need more pages (album has >20 tracks)."""
    tracks_obj = (album_data or {}).get("tracks") or {}
    total = tracks_obj.get("total", 0)
    items = tracks_obj.get("items") or []
    if total > 0 and len(items) >= total:
        return items
    return fetch_album_tracks(access_token, spotify_album_id)


def create_or_update_album_from_spotify(
    user_id: str,
    spotify_album_id: str,
    access_token: str,
    db: Session,
    album_data: dict[str, Any] | None = None,
    *,
    auto_commit: bool = True,
) -> Album | None:
    """Create or update an album and its tracks from Spotify.
    Album file_path = spotify/{user_id}/{spotify_album_id}.
    Track file_path = spotify/{user_id}/{spotify_album_id}/{spotify_track_id} (per-album so reissues share tracks). Returns album.

    Pass pre-fetched album_data (from fetch_albums_batch) to skip the individual album API call.
    Tracks are taken from album_data['tracks'] when present and complete; otherwise the
    album tracks endpoint is called (only for albums with >20 tracks when using batch data).

    When auto_commit=False, caller must commit and refresh the returned album (used in batch flows
    that use savepoints so the outer transaction is not committed inside this function).
    """
    if album_data is None:
        album_data = fetch_album(access_token, spotify_album_id)
    tracks_data = _tracks_from_album_response(access_token, spotify_album_id, album_data)

    # Don't create a new album with no tracks — something went wrong fetching them
    if not tracks_data:
        logger.warning("Skipping Spotify album %s — no tracks returned", spotify_album_id)
        return None

    file_path = f"spotify/{user_id}/{spotify_album_id}"
    artists = album_data.get("artists") or []
    artist_name = artists[0].get("name", "Unknown") if artists else "Unknown"
    title = album_data.get("name") or "Unknown"
    images = album_data.get("images") or []
    cover_url = images[0].get("url") if images else None
    year_str = (album_data.get("release_date") or "")[:4]
    year = int(year_str) if year_str.isdigit() else None

    spotify_url_val = album_data.get("external_urls", {}).get("spotify")

    # 1. Exact match on the Spotify-synced file_path (already imported via this flow)
    existing = (
        db.query(Album)
        .filter(Album.user_id == user_id, Album.file_path == file_path)
        .first()
    )
    # 2. Fallback: a local-file album that was already linked to this Spotify album ID
    #    (e.g. via the backfill script). Avoid creating a duplicate cloud-only record.
    if existing is None:
        existing = (
            db.query(Album)
            .filter(Album.user_id == user_id, Album.spotify_id == spotify_album_id)
            .first()
        )

    if existing:
        album = existing
        album.spotify_id = spotify_album_id
        album.spotify_url = spotify_url_val
        if cover_url:
            album.spotify_image_url = cover_url
        # Only overwrite title/artist/year on pure Spotify-origin albums (no local files)
        if album.file_path.startswith("spotify/"):
            album.title = title
            album.artist = artist_name
            album.year = year
    else:
        album = Album(
            user_id=user_id,
            file_path=file_path,
            title=title,
            artist=artist_name,
            cover_art_path=None,
            total_tracks=len(tracks_data),
            year=year,
            spotify_id=spotify_album_id,
            spotify_url=spotify_url_val,
            spotify_image_url=cover_url,
        )
        db.add(album)
        db.flush()

    # Order existing tracks by disc, track number
    existing_ordered = sorted(album.tracks, key=lambda t: (t.disc_number, t.track_number))
    # Sync tracks by order: match by spotify_id or by index
    for i, tr in enumerate(tracks_data):
        spotify_track_id = tr.get("id")
        name = tr.get("name") or "Track"
        art = tr.get("artists") or []
        track_artist = art[0].get("name", "Unknown") if art else "Unknown"
        duration_ms = tr.get("duration_ms") or 0
        track_number = tr.get("track_number") or (i + 1)
        disc_number = tr.get("disc_number") or 1
        existing_track = next(
            (t for t in album.tracks if t.spotify_id == spotify_track_id),
            existing_ordered[i] if i < len(existing_ordered) else None,
        )
        if existing_track:
            existing_track.title = name
            existing_track.artist = track_artist
            existing_track.duration_ms = duration_ms
            existing_track.track_number = track_number
            existing_track.disc_number = disc_number
            existing_track.spotify_id = spotify_track_id
        else:
            # Per-album path so the same Spotify track can appear on multiple albums (e.g. reissues).
            track_file_path = f"spotify/{user_id}/{spotify_album_id}/{spotify_track_id}"
            if db.query(Track).filter(Track.file_path == track_file_path).first() is not None:
                continue
            t = Track(
                album_id=album.id,
                disc_number=disc_number,
                track_number=track_number,
                title=name,
                artist=track_artist,
                duration_ms=duration_ms,
                enabled=True,
                file_path=track_file_path,
                spotify_id=spotify_track_id,
            )
            db.add(t)
    # Reflect actual track count (album.tracks may not include newly added rows until refresh, so query DB)
    db.flush()
    album.total_tracks = db.query(Track).filter(Track.album_id == album.id).count()
    if auto_commit:
        db.commit()
        db.refresh(album)
    return album
