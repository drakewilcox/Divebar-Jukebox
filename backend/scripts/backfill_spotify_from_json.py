#!/usr/bin/env python3
"""
Backfill Album and Track with Spotify IDs and Album tidal_url from albums_to_download.json.

Matches DB albums to JSON entries by normalized (title, artist). For each match:
- Sets album spotify_id, spotify_url from JSON; sets album tidal_url (and tidal_id parsed from URL).
- If JSON has spotify_id, fetches album tracks from Spotify API and sets track.spotify_id by order.

Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in env (client credentials flow).
Run from backend dir: python -m scripts.backfill_spotify_from_json [--dry-run] [--limit N] [--json PATH]
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

# Add backend root to path
_backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend_root))

from sqlalchemy.orm import Session

import requests

from app.database import SessionLocal
from app.models.album import Album
from app.models.track import Track

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ALBUM_TRACKS_URL = "https://api.spotify.com/v1/albums/{album_id}/tracks"
DEFAULT_JSON_PATH = _backend_root.parent / "tools" / "tidal-dl-helper-scripts" / "albums_to_download.json"
TRACKS_DELAY = 0.2  # Rate limit between Spotify album-tracks calls


def _normalize(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _json_album_key(entry: dict) -> tuple:
    """Normalized (title, primary_artist) for matching."""
    title = _normalize(entry.get("name") or "")
    artists = entry.get("artists") or []
    primary = _normalize(artists[0].get("name") or "") if artists else ""
    return (title, primary)


def _db_album_key(album: Album) -> tuple:
    return (_normalize(album.title), _normalize(album.artist))


def _parse_tidal_id_from_url(tidal_url: str) -> str | None:
    if not tidal_url or not isinstance(tidal_url, str):
        return None
    # e.g. https://tidal.com/browse/album/1104286 or https://tidal.com/album/411651678/
    m = re.search(r"/album/(\d+)", tidal_url.strip())
    return m.group(1) if m else None


def get_spotify_token(client_id: str, client_secret: str) -> str:
    resp = requests.post(
        SPOTIFY_TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def fetch_album_track_ids(album_id: str, token: str) -> list[str]:
    """Return list of Spotify track IDs in album order (all pages)."""
    out: list[str] = []
    url = SPOTIFY_ALBUM_TRACKS_URL.format(album_id=album_id)
    params = {"limit": 50, "offset": 0}
    while True:
        resp = requests.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items") or []
        for item in items:
            tid = item.get("id")
            if tid:
                out.append(tid)
        if not items or len(items) < 50:
            break
        params["offset"] += 50
        time.sleep(0.05)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill Album/Track with Spotify IDs and album tidal_url from albums_to_download.json"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write to DB",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        metavar="N",
        help="Process at most N DB albums (0 = no limit)",
    )
    parser.add_argument(
        "--json",
        type=Path,
        default=DEFAULT_JSON_PATH,
        help=f"Path to albums_to_download.json (default: {DEFAULT_JSON_PATH})",
    )
    args = parser.parse_args()

    if not args.json.exists():
        print(f"JSON file not found: {args.json}", file=sys.stderr)
        sys.exit(1)

    try:
        albums_json = json.loads(args.json.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Failed to load JSON: {e}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(albums_json, list):
        print("JSON root must be a list of album objects.", file=sys.stderr)
        sys.exit(1)

    # Build lookup: (normalized title, primary artist) -> json entry
    json_by_key: dict[tuple, dict] = {}
    for entry in albums_json:
        k = _json_album_key(entry)
        if k not in json_by_key:
            json_by_key[k] = entry
        # Prefer entry with spotify_id if we have duplicates
        if entry.get("spotify_id") and not json_by_key[k].get("spotify_id"):
            json_by_key[k] = entry

    db: Session = SessionLocal()
    try:
        albums = db.query(Album).order_by(Album.artist, Album.title).all()
        if args.limit:
            albums = albums[: args.limit]

        # Use app config (reads backend/.env) so credentials work when running: python -m scripts.backfill_spotify_from_json
        from app.config import settings as app_settings
        client_id = app_settings.spotify_client_id
        client_secret = app_settings.spotify_client_secret

        token = None
        if client_id and client_secret:
            try:
                token = get_spotify_token(client_id, client_secret)
            except Exception as e:
                print(f"Spotify token failed: {e}", file=sys.stderr)
                token = None
        if not token:
            print("Warning: SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set or invalid; skipping track spotify_id backfill.", file=sys.stderr)

        matched = 0
        updated_albums = 0
        updated_tracks = 0
        errors = []

        for i, album in enumerate(albums):
            key = _db_album_key(album)
            entry = json_by_key.get(key)
            if not entry:
                continue
            matched += 1

            # Update album: spotify, tidal
            album_updated = False
            if entry.get("spotify_id"):
                if album.spotify_id != entry["spotify_id"]:
                    album.spotify_id = entry["spotify_id"]
                    album.spotify_url = entry.get("spotify_url") or f"https://open.spotify.com/album/{entry['spotify_id']}"
                    album_updated = True
            if entry.get("tidal_url"):
                tidal_url = entry["tidal_url"] if isinstance(entry["tidal_url"], str) and entry["tidal_url"].strip() else None
                if tidal_url and album.tidal_url != tidal_url:
                    album.tidal_url = tidal_url
                    tid = _parse_tidal_id_from_url(tidal_url)
                    if tid:
                        album.tidal_id = tid
                    album_updated = True
            if album_updated:
                updated_albums += 1
                print(f"  Album: {album.artist} - {album.title} -> spotify={album.spotify_id}, tidal_url={album.tidal_url or 'n/a'}")

            # Fetch Spotify track IDs and match by order
            if token and album.spotify_id:
                tracks_db = db.query(Track).filter(Track.album_id == album.id).order_by(Track.disc_number, Track.track_number).all()
                if not tracks_db:
                    continue
                try:
                    spotify_track_ids = fetch_album_track_ids(album.spotify_id, token)
                    if len(spotify_track_ids) >= len(tracks_db):
                        for j, track in enumerate(tracks_db):
                            if j < len(spotify_track_ids) and track.spotify_id != spotify_track_ids[j]:
                                track.spotify_id = spotify_track_ids[j]
                                updated_tracks += 1
                    elif spotify_track_ids:
                        # Try to match by position where possible
                        for j, track in enumerate(tracks_db):
                            if j < len(spotify_track_ids):
                                if track.spotify_id != spotify_track_ids[j]:
                                    track.spotify_id = spotify_track_ids[j]
                                    updated_tracks += 1
                    time.sleep(TRACKS_DELAY)
                except Exception as e:
                    errors.append(f"{album.artist} - {album.title}: {e}")

        if errors:
            for e in errors:
                print(f"  Error: {e}", file=sys.stderr)

        print(f"Matched: {matched}, Updated albums: {updated_albums}, Updated tracks: {updated_tracks}")
        if not args.dry_run and (updated_albums or updated_tracks):
            db.commit()
            print("Committed.")
        elif args.dry_run:
            print("Dry run; no changes committed.")
        else:
            print("No updates; nothing to commit.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
