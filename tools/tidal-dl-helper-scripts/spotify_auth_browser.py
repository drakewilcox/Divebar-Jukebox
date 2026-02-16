#!/usr/bin/env python3
"""
One-time OAuth using your existing Spotify web session.

Run this script. It starts a local server and prints a URL. Open that URL
in the browser where you're already logged into Spotify (e.g. open.spotify.com).
After you click "Continue" / authorize, the redirect hits this server, we
exchange the code for tokens, and save them to .spotify_cache so
get_saved_albums.py works without opening a browser again.

Use this when the normal Spotipy flow fails (e.g. redirect URI / localhost
issues). Your redirect_uri in .env must still match one in the Spotify app
Dashboard (e.g. http://localhost:8888/callback or http://127.0.0.1:8888/callback).
"""
import json
import os
import time
import urllib.parse as urllibparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import requests
from dotenv import load_dotenv

_PROJECT_DIR = Path(__file__).resolve().parent
_CACHE_PATH = _PROJECT_DIR / ".spotify_cache"
SCOPE = "user-library-read"

# Load .env
load_dotenv(_PROJECT_DIR / ".env")


def _clean_uri(uri: str | None) -> str:
    if not uri:
        uri = "http://localhost:8080"
    else:
        uri = uri.strip().strip("'\"")
        if uri and not uri.startswith(("http://", "https://")):
            uri = "http://" + uri
    # Spotify rejects "localhost" (Insecure redirect URI). Always use 127.0.0.1.
    if "localhost" in uri:
        uri = uri.replace("localhost", "127.0.0.1")
    return uri


CLIENT_ID = os.getenv("SPOTIPY_CLIENT_ID")
CLIENT_SECRET = os.getenv("SPOTIPY_CLIENT_SECRET")
REDIRECT_URI = _clean_uri(os.getenv("SPOTIPY_REDIRECT_URI"))


def get_authorize_url():
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPE,
    }
    return "https://accounts.spotify.com/authorize?" + urllibparse.urlencode(params)


def exchange_code_for_token(code: str) -> dict:
    """Exchange authorization code for access + refresh token."""
    auth = requests.auth.HTTPBasicAuth(CLIENT_ID, CLIENT_SECRET)
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
        },
        auth=auth,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    data = resp.json()
    data["expires_at"] = int(time.time()) + data["expires_in"]
    data["scope"] = SCOPE
    return data


def save_cache(token_info: dict) -> None:
    _CACHE_PATH.write_text(json.dumps(token_info), encoding="utf-8")
    try:
        _CACHE_PATH.chmod(0o600)
    except OSError:
        pass


# Server state
auth_code: str | None = None
server_error: str | None = None


class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code, server_error
        parsed = urllibparse.urlparse(self.path)
        if parsed.path in ("/", "/callback", "/callback/"):
            qs = urllibparse.parse_qs(parsed.query)
            if "error" in qs:
                server_error = qs["error"][0] + ": " + (qs.get("error_description", [""])[0])
            elif "code" in qs:
                auth_code = qs["code"][0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(
            b"<html><body><p>You can close this tab and return to the terminal.</p></body></html>"
        )

    def log_message(self, format, *args):
        pass


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        print("Set SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET in .env")
        return
    print(f"Using redirect_uri: {REDIRECT_URI!r}")
    print("  ^ This must match EXACTLY one entry in Spotify Dashboard → Your App → Edit Settings → Redirect URIs")
    print("  (same scheme, host, port, path; no trailing slash)\n")
    # Parse host/port from redirect URI (e.g. http://localhost:8888/callback -> 8888)
    parsed = urllibparse.urlparse(REDIRECT_URI)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (8080 if "8080" in REDIRECT_URI else 8888)
    # Bind to 127.0.0.1 so we accept both 127.0.0.1 and localhost
    bind_host = "127.0.0.1" if host in ("localhost", "127.0.0.1") else host
    server = HTTPServer((bind_host, port), CallbackHandler)
    url = get_authorize_url()
    print(f"Open this URL in the browser where you're logged into Spotify:\n\n  {url}\n")
    print(f"Waiting for callback on {REDIRECT_URI} ...")
    server.handle_request()
    server.server_close()
    if server_error:
        print(f"Error from Spotify: {server_error}")
        return
    if not auth_code:
        print("No authorization code received. Did you approve the app and get redirected?")
        return
    try:
        token_info = exchange_code_for_token(auth_code)
        save_cache(token_info)
        print(f"Token saved to {_CACHE_PATH}. You can run: python get_saved_albums.py")
    except requests.HTTPError as e:
        print(f"Token exchange failed: {e}")
        if e.response is not None and hasattr(e.response, "text"):
            print(e.response.text)
        if "insecure" in str(e).lower() or (e.response and "insecure" in (e.response.text or "").lower()):
            print("\nSpotify rejects 'localhost' as insecure. Use 127.0.0.1 instead:")
            print("  1. In Spotify Dashboard → Your App → Edit Settings → Redirect URIs")
            print("     add:  http://127.0.0.1:8888/callback")
            print("     (or edit an existing localhost URI to use 127.0.0.1)")
            print("  2. In .env set:  SPOTIPY_REDIRECT_URI=http://127.0.0.1:8888/callback")


if __name__ == "__main__":
    main()
