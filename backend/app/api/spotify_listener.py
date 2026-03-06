"""Spotify OAuth for listeners: authorize, callback, refresh. No server-side token storage."""
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import settings

SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"

# Scopes for Web Playback SDK and controlling playback
SPOTIFY_SCOPES = [
    "streaming",
    "user-modify-playback-state",
    "user-read-playback-state",
    "user-read-email",
]

router = APIRouter(prefix="/api/auth/spotify", tags=["spotify-listener"])


def _spotify_configured() -> bool:
    return bool(settings.spotify_client_id and settings.spotify_client_secret)


@router.get("/status")
def spotify_status():
    """Return whether Spotify listener OAuth is configured (so frontend can show Authorize button)."""
    return {"configured": _spotify_configured()}


@router.get("")
def spotify_authorize():
    """Redirect the user to Spotify to authorize. State is optional but recommended."""
    if not _spotify_configured():
        raise HTTPException(status_code=503, detail="Spotify is not configured")
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": _callback_uri(),
        "scope": " ".join(SPOTIFY_SCOPES),
        "state": state,
        "show_dialog": "false",
    }
    url = SPOTIFY_AUTHORIZE_URL + "?" + urlencode(params)
    return RedirectResponse(url=url)


def _callback_uri() -> str:
    """Full URL for Spotify to redirect to after user authorizes. Use 127.0.0.1 so Spotify accepts it."""
    base = (settings.api_base_url or f"http://127.0.0.1:{settings.api_port}").rstrip("/")
    return f"{base}/api/auth/spotify/callback"


@router.get("/callback")
async def spotify_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Exchange code for tokens and redirect to frontend with tokens in fragment."""
    if not _spotify_configured():
        raise HTTPException(status_code=503, detail="Spotify is not configured")
    if error:
        # User denied or error from Spotify; redirect to frontend with error in fragment
        frontend = settings.frontend_url.rstrip("/")
        return RedirectResponse(url=f"{frontend}/#spotify_error={error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _callback_uri(),
            },
            auth=(settings.spotify_client_id, settings.spotify_client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        frontend = settings.frontend_url.rstrip("/")
        return RedirectResponse(url=f"{frontend}/#spotify_error=token_exchange_failed")
    data = resp.json()
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    frontend = settings.frontend_url.rstrip("/")
    fragment = f"spotify_access_token={access_token or ''}"
    if refresh_token:
        fragment += f"&spotify_refresh_token={refresh_token}"
    return RedirectResponse(url=f"{frontend}/#{fragment}")


class SpotifyRefreshRequest(BaseModel):
    refresh_token: str


# Admin flow: redirect to Spotify with redirect_uri = frontend so frontend can POST code to backend
ADMIN_SCOPES = ["user-library-read", "playlist-read-private"]


def _admin_redirect_uri() -> str:
    return f"{settings.frontend_url.rstrip('/')}/admin/spotify-callback"


@router.get("/admin")
def spotify_admin_authorize():
    """Redirect admin to Spotify to authorize (scope: saved albums, playlists). Frontend receives code at /admin/spotify-callback."""
    if not _spotify_configured():
        raise HTTPException(status_code=503, detail="Spotify is not configured")
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": _admin_redirect_uri(),
        "scope": " ".join(ADMIN_SCOPES),
        "state": state,
        "show_dialog": "false",
    }
    url = SPOTIFY_AUTHORIZE_URL + "?" + urlencode(params)
    return RedirectResponse(url=url)


@router.post("/refresh")
async def spotify_refresh(body: SpotifyRefreshRequest):
    """Exchange a refresh token for a new access token. Used by frontend when token expires."""
    if not _spotify_configured():
        raise HTTPException(status_code=503, detail="Spotify is not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": body.refresh_token,
            },
            auth=(settings.spotify_client_id, settings.spotify_client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to refresh Spotify token")
    data = resp.json()
    return {"access_token": data.get("access_token"), "expires_in": data.get("expires_in")}
