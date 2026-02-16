#!/usr/bin/env python3
"""
Fetch your Spotify saved albums and merge them into albums_to_download.json.

New albums are appended (no duplicates by spotify_id). Existing entries keep their
downloaded, tidal_url, no_match fields. Uses same auth as spotify_auth (SPOTIPY_*
env / .env, .spotify_cache). On first run you'll be prompted to log in in the browser.
"""
import json
import sys
from pathlib import Path

from spotify_auth import get_spotify_client

OUTPUT_FILE = Path(__file__).resolve().parent / "albums_to_download.json"
PAGE_SIZE = 50


def _album_key(entry: dict) -> tuple:
    """Unique key for duplicate detection: prefer spotify_id, then spotify_url, else name + artists."""
    album_id = entry.get("spotify_id", "").strip()
    if album_id:
        return ("id", album_id)
    url = entry.get("spotify_url", "").strip()
    if url:
        return ("url", url)
    name = entry.get("name", "")
    artists = tuple(a.get("name", "") for a in entry.get("artists", []))
    return ("name_artists", (name, artists))


def _normalize_key(entry: dict) -> tuple:
    """(name, artists) normalized for matching to Spotify data."""
    name = (entry.get("name") or "").strip().lower()
    artists = tuple(
        (a.get("name") or "").strip().lower()
        for a in entry.get("artists", [])
    )
    return (name, artists)


def main() -> None:
    existing: list[dict] = []
    if OUTPUT_FILE.exists():
        existing = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
        if not isinstance(existing, list):
            existing = []
    seen_keys = {_album_key(a) for a in existing}

    sp = get_spotify_client()
    spotify_entries: list[dict] = []
    offset = 0
    while True:
        page = sp.current_user_saved_albums(limit=PAGE_SIZE, offset=offset)
        items = page.get("items", [])
        if not items:
            break
        for item in items:
            album = item.get("album", {})
            album_id = album.get("id", "")
            artists = [{"name": a.get("name", "")} for a in album.get("artists", [])]
            spotify_entries.append({
                "name": album.get("name", ""),
                "artists": artists,
                "spotify_id": album_id,
                "spotify_url": f"https://open.spotify.com/album/{album_id}" if album_id else "",
            })
        offset += len(items)
        if not page.get("next"):
            break

    # Lookup: normalized (name, artists) -> spotify entry (for backfilling)
    by_name_artists = {_normalize_key(e): e for e in spotify_entries}

    # Backfill spotify_id and spotify_url for existing entries that are missing them
    backfilled = 0
    for entry in existing:
        if entry.get("spotify_id") and entry.get("spotify_url"):
            continue
        k = _normalize_key(entry)
        if k in by_name_artists:
            s = by_name_artists[k]
            entry["spotify_id"] = s.get("spotify_id", "")
            entry["spotify_url"] = s.get("spotify_url", "")
            backfilled += 1

    # Recompute seen_keys so backfilled entries (now with spotify_id) count as seen — avoids adding duplicates
    seen_keys = {_album_key(a) for a in existing}

    # Add new albums from Spotify that aren't already in the list
    added: list[dict] = []
    for entry in spotify_entries:
        key = _album_key(entry)
        if key not in seen_keys:
            seen_keys.add(key)
            added.append(entry)

    albums = existing + added
    albums.sort(key=lambda a: (a["artists"][0]["name"].lower() if a.get("artists") else "", a["name"].lower()))
    OUTPUT_FILE.write_text(json.dumps(albums, indent=2), encoding="utf-8")
    print(
        f"Wrote {len(albums)} albums to {OUTPUT_FILE.name}: {backfilled} backfilled with Spotify id/url, {len(added)} new.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
