#!/usr/bin/env python3
"""
One-time merge: combine albums_to_download.json and spotify_saved_albums.json
into a single albums_to_download.json.

- Every entry already in albums_to_download gets spotify_id and spotify_url added
  when a match is found in spotify_saved_albums (by name + artists). Other fields
  (downloaded, tidal_url, no_match) are left unchanged.
- Every entry from spotify_saved_albums that is not already in albums_to_download
  is appended with only name, artists, spotify_id, spotify_url (no downloaded,
  tidal_url, no_match).
- Result is sorted alphabetically by artist then album name and written to
  albums_to_download.json.
"""
import json
import sys
from pathlib import Path

_PROJECT_DIR = Path(__file__).resolve().parent
ALBUMS_FILE = _PROJECT_DIR / "albums_to_download.json"
SPOTIFY_FILE = _PROJECT_DIR / "spotify_saved_albums.json"


def _normalize_key(entry: dict) -> tuple:
    """(name, artists) normalized for matching."""
    name = (entry.get("name") or "").strip().lower()
    artists = tuple(
        (a.get("name") or "").strip().lower()
        for a in entry.get("artists", [])
    )
    return (name, artists)


def main() -> None:
    if not ALBUMS_FILE.exists():
        print(f"Missing {ALBUMS_FILE}", file=sys.stderr)
        sys.exit(1)
    if not SPOTIFY_FILE.exists():
        print(f"Missing {SPOTIFY_FILE}", file=sys.stderr)
        sys.exit(1)

    albums = json.loads(ALBUMS_FILE.read_text(encoding="utf-8"))
    if not isinstance(albums, list):
        albums = []

    spotify_list = json.loads(SPOTIFY_FILE.read_text(encoding="utf-8"))
    if not isinstance(spotify_list, list):
        spotify_list = []

    # Lookup: normalized (name, artists) -> spotify entry (for id/url)
    by_name_artists = {_normalize_key(s): s for s in spotify_list}

    # Add spotify_id and spotify_url to existing albums_to_download entries when matched
    updated = 0
    for entry in albums:
        k = _normalize_key(entry)
        if k in by_name_artists:
            s = by_name_artists[k]
            if s.get("spotify_id") or s.get("spotify_url"):
                entry["spotify_id"] = s.get("spotify_id", "")
                entry["spotify_url"] = s.get("spotify_url", "")
                updated += 1

    # Don't add spotify entries that are already in albums_to_download
    existing_spotify_ids = {a.get("spotify_id") for a in albums if a.get("spotify_id")}
    existing_keys = {_normalize_key(a) for a in albums}

    added = 0
    for s in spotify_list:
        sid = s.get("spotify_id")
        if sid and sid in existing_spotify_ids:
            continue
        if _normalize_key(s) in existing_keys:
            continue
        albums.append({
            "name": s.get("name", ""),
            "artists": s.get("artists", []),
            "spotify_id": s.get("spotify_id", ""),
            "spotify_url": s.get("spotify_url", ""),
        })
        added += 1
        if sid:
            existing_spotify_ids.add(sid)
        existing_keys.add(_normalize_key(s))

    albums.sort(key=lambda a: (a["artists"][0]["name"].lower() if a.get("artists") else "", a["name"].lower()))
    ALBUMS_FILE.write_text(json.dumps(albums, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(albums)} albums to {ALBUMS_FILE.name}: {updated} existing updated with Spotify id/url, {added} new from Spotify.", file=sys.stderr)


if __name__ == "__main__":
    main()
