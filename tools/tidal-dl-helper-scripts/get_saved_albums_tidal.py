#!/usr/bin/env python3
"""
Fetch your Tidal saved (favorite) albums and merge them into albums_to_download.json.

Uses the same Tidal session as resolve_tidal.py (.tidal_session.json). On first run
you'll be prompted to log in. New albums are appended (no duplicates by tidal_url).
Existing entries get tidal_url backfilled when name+artists match. Other fields
(spotify_id, downloaded, etc.) are preserved.
"""
import json
import sys
from pathlib import Path

from tidalapi import Session

_PROJECT_DIR = Path(__file__).resolve().parent
ALBUMS_FILE = _PROJECT_DIR / "albums_to_download.json"
SESSION_FILE = _PROJECT_DIR / ".tidal_session.json"
PAGE_SIZE = 50


def _album_key(entry: dict) -> tuple:
    """Unique key for duplicate detection: prefer tidal_url, then (name, artists)."""
    url = (entry.get("tidal_url") or "").strip()
    if url:
        return ("url", url)
    name = entry.get("name", "")
    artists = tuple(a.get("name", "") for a in entry.get("artists", []))
    return ("name_artists", (name, artists))


def _normalize_key(entry: dict) -> tuple:
    """(name, artists) normalized for matching."""
    name = (entry.get("name") or "").strip().lower()
    artists = tuple(
        (a.get("name") or "").strip().lower()
        for a in entry.get("artists", [])
    )
    return (name, artists)


def main() -> None:
    existing: list[dict] = []
    if ALBUMS_FILE.exists():
        existing = json.loads(ALBUMS_FILE.read_text(encoding="utf-8"))
        if not isinstance(existing, list):
            existing = []
    seen_keys = {_album_key(a) for a in existing}

    session = Session()
    if not session.login_session_file(SESSION_FILE):
        print("Tidal login failed.", file=sys.stderr)
        sys.exit(1)

    tidal_entries: list[dict] = []
    offset = 0
    while True:
        page = session.user.favorites.albums(limit=PAGE_SIZE, offset=offset)
        if not page:
            break
        for album in page:
            name = getattr(album, "name", None) or ""
            artists_list = getattr(album, "artists", None) or []
            if not artists_list and getattr(album, "artist", None):
                artists_list = [album.artist]
            artists = [{"name": getattr(a, "name", "") or ""} for a in artists_list]
            album_id = getattr(album, "id", None)
            tidal_url = (
                f"https://tidal.com/browse/album/{album_id}" if album_id else ""
            )
            tidal_entries.append({
                "name": name,
                "artists": artists,
                "tidal_url": tidal_url,
            })
        offset += len(page)
        if len(page) < PAGE_SIZE:
            break

    # Lookup: normalized (name, artists) -> tidal entry (for backfilling)
    by_name_artists = {_normalize_key(e): e for e in tidal_entries}

    # Backfill tidal_url for existing entries that are missing it
    backfilled = 0
    for entry in existing:
        if entry.get("tidal_url"):
            continue
        k = _normalize_key(entry)
        if k in by_name_artists:
            t = by_name_artists[k]
            entry["tidal_url"] = t.get("tidal_url", "")
            backfilled += 1

    seen_keys = {_album_key(a) for a in existing}

    # Add new albums from Tidal that aren't already in the list
    added: list[dict] = []
    for entry in tidal_entries:
        key = _album_key(entry)
        if key not in seen_keys:
            seen_keys.add(key)
            added.append(entry)

    albums = existing + added
    albums.sort(
        key=lambda a: (
            a["artists"][0]["name"].lower() if a.get("artists") else "",
            a["name"].lower(),
        )
    )
    ALBUMS_FILE.write_text(
        json.dumps(albums, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {len(albums)} albums to {ALBUMS_FILE.name}: {backfilled} backfilled with tidal_url, {len(added)} new.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
