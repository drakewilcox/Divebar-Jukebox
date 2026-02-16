"""
Spotify OAuth and client setup for tidal-dl-helper-scripts.

Uses SPOTIPY_* env vars (or .env). Token is cached so you only log in once.
"""
from pathlib import Path

from dotenv import load_dotenv
from spotipy import Spotify
from spotipy.oauth2 import SpotifyOAuth

# Scope needed to read your saved albums
SCOPE_SAVED_ALBUMS = "user-library-read"

# Cache file for the OAuth token (so you don't re-login every run)
_PROJECT_DIR = Path(__file__).resolve().parent
_CACHE_PATH = _PROJECT_DIR / ".spotify_cache"


def load_env() -> None:
    """Load .env from project dir if present (no-op if not)."""
    load_dotenv(_PROJECT_DIR / ".env")


def get_spotify_client(scope: str = SCOPE_SAVED_ALBUMS) -> Spotify:
    """
    Return an authenticated Spotipy client.

    Uses SPOTIPY_CLIENT_ID, SPOTIPY_CLIENT_SECRET, and optionally
    SPOTIPY_REDIRECT_URI (defaults to http://localhost:8080).
    On first run with no cached token, opens the browser for you to log in;
    the token is then cached in .spotify_cache.

    Raises:
        Exception: If credentials are missing or auth fails.
    """
    load_env()
    auth = SpotifyOAuth(
        scope=scope,
        cache_path=str(_CACHE_PATH),
        open_browser=True,
    )
    return Spotify(auth_manager=auth)
