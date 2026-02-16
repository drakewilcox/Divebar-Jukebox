#!/usr/bin/env python3
"""
Save a Spotify token to .spotify_cache using a refresh_token you already have.

Use this when you got a token via Postman (or another tool) using a secure
redirect URI like https://oauth.pstmn.io/v1/callback. Paste your refresh_token
and we'll fetch a fresh access_token and write the cache so get_saved_albums.py works.

Usage:
  python save_token_from_refresh.py
  (then paste the refresh_token when prompted)

Or set the token in env so you don't paste it into the shell:
  SPOTIFY_REFRESH_TOKEN=your_refresh_token_here python save_token_from_refresh.py
"""
import json
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

_PROJECT_DIR = Path(__file__).resolve().parent
_CACHE_PATH = _PROJECT_DIR / ".spotify_cache"
SCOPE = "user-library-read"

load_dotenv(_PROJECT_DIR / ".env")
CLIENT_ID = os.getenv("SPOTIPY_CLIENT_ID")
CLIENT_SECRET = os.getenv("SPOTIPY_CLIENT_SECRET")


def refresh_access_token(refresh_token: str) -> dict:
    auth = requests.auth.HTTPBasicAuth(CLIENT_ID, CLIENT_SECRET)
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        auth=auth,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    data = resp.json()
    data["expires_at"] = int(time.time()) + data["expires_in"]
    data["scope"] = SCOPE
    if "refresh_token" not in data:
        data["refresh_token"] = refresh_token
    return data


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        print("Set SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET in .env")
        return
    refresh_token = os.getenv("SPOTIFY_REFRESH_TOKEN", "").strip()
    if not refresh_token:
        print("Paste your Spotify refresh_token (from Postman or another OAuth flow), then press Enter:")
        refresh_token = input().strip()
    if not refresh_token:
        print("No refresh token provided.")
        return
    try:
        token_info = refresh_access_token(refresh_token)
        _CACHE_PATH.write_text(json.dumps(token_info), encoding="utf-8")
        try:
            _CACHE_PATH.chmod(0o600)
        except OSError:
            pass
        print(f"Token saved to {_CACHE_PATH}. Run: python get_saved_albums.py")
    except requests.HTTPError as e:
        print(f"Failed: {e}")
        if e.response is not None and hasattr(e.response, "text"):
            print(e.response.text)


if __name__ == "__main__":
    main()
