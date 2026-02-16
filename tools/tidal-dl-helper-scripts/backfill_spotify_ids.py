#!/usr/bin/env python3
"""
Backfill spotify_id and spotify_url for entries in albums_to_download.json that
don't have them. Uses Spotify Search API (no need for the album to be in your
saved list). Only updates entries in place; does not add or remove any rows.

Match is by album name + artist(s): we only set id/url when we find a result
that matches both, to avoid wrong albums (e.g. same title, different artist).
"""
import json
import re
import sys
import time
from pathlib import Path

from spotify_auth import get_spotify_client

_PROJECT_DIR = Path(__file__).resolve().parent
ALBUMS_FILE = _PROJECT_DIR / "albums_to_download.json"
SEARCH_DELAY = 0.4  # seconds between searches to avoid rate limits


def _normalize(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _sanitize_for_search(s: str) -> str:
    """Remove characters that break Spotify search (quotes, apostrophes)."""
    if not s:
        return ""
    s = s.strip().replace('"', " ").replace("'", "").replace("'", "").replace("'", "")
    return re.sub(r"\s+", " ", s).strip()


def _build_search_query(entry: dict) -> str:
    """Build a query for Spotify search: album name and primary artist."""
    artists = entry.get("artists") or []
    names = [a.get("name", "").strip() for a in artists if a.get("name")]
    album_name = _sanitize_for_search(entry.get("name") or "")
    if not album_name and not names:
        return ""
    # Spotify search: album:"Name" artist:Name (quotes help exact phrase)
    parts = []
    if album_name:
        parts.append(f'album:"{album_name}"')
    if names:
        artist = _sanitize_for_search(names[0] or "")
        if artist:
            parts.append(f'artist:"{artist}"')
    return " ".join(parts) if parts else ""


def _get_spotify_artist_names(album_item: dict) -> set:
    names = set()
    for a in album_item.get("artists") or []:
        n = (a.get("name") or "").strip()
        if n:
            names.add(_normalize(n))
    return names


def _score_match(entry: dict, album_item: dict) -> tuple[int, bool]:
    """
    Score how well a Spotify search result matches our entry.
    Returns (score, acceptable). acceptable = True only if both album and artist match.
    """
    want_album = _normalize(entry.get("name") or "")
    want_artists = {
        _normalize(a.get("name") or "")
        for a in (entry.get("artists") or [])
        if a.get("name")
    }
    got_album = _normalize(album_item.get("name") or "")
    got_artists = _get_spotify_artist_names(album_item)

    if want_album == got_album:
        album_score = 2
        album_ok = True
    elif not want_album or not got_album:
        album_score = 0
        album_ok = False
    elif want_album in got_album or got_album in want_album:
        album_score = 1
        album_ok = True
    else:
        album_score = 0
        album_ok = False

    artist_ok = bool(want_artists & got_artists) or any(
        wa in ga or ga in wa for wa in want_artists for ga in got_artists
    )
    artist_score = 1 if artist_ok else 0
    score = album_score + artist_score
    acceptable = album_ok and artist_ok
    return score, acceptable


def main() -> None:
    if not ALBUMS_FILE.exists():
        print(f"Missing {ALBUMS_FILE}", file=sys.stderr)
        return

    albums = json.loads(ALBUMS_FILE.read_text(encoding="utf-8"))
    if not isinstance(albums, list):
        print("Invalid albums file.", file=sys.stderr)
        return

    to_update = [i for i, e in enumerate(albums) if not (e.get("spotify_id") or e.get("spotify_url"))]
    if not to_update:
        print("No entries missing spotify_id/spotify_url. Nothing to do.")
        return

    print(f"Found {len(to_update)} entries without spotify_id. Searching Spotify...")
    sp = get_spotify_client()

    updated = 0
    for idx, i in enumerate(to_update):
        entry = albums[i]
        query = _build_search_query(entry)
        if not query:
            print(f"  [{idx+1}/{len(to_update)}] Skipped (no name/artist): {entry.get('name', '')!r}")
            continue
        try:
            result = sp.search(q=query, type="album", limit=10)
            items = (result.get("albums") or {}).get("items") or []
            chosen = None
            best_score = -1
            for item in items:
                score, acceptable = _score_match(entry, item)
                if acceptable and score > best_score:
                    best_score = score
                    chosen = item
            if chosen and chosen.get("id"):
                entry["spotify_id"] = chosen["id"]
                entry["spotify_url"] = f"https://open.spotify.com/album/{chosen['id']}"
                updated += 1
                print(f"  [{idx+1}/{len(to_update)}] {query[:60]!r} -> {chosen['id']}")
            else:
                reason = "no results" if not items else "no matching album+artist"
                print(f"  [{idx+1}/{len(to_update)}] {query[:60]!r} -> {reason}")
        except Exception as e:
            print(f"  [{idx+1}/{len(to_update)}] {query[:60]!r} -> error: {e}")
        time.sleep(SEARCH_DELAY)

    ALBUMS_FILE.write_text(json.dumps(albums, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nUpdated {updated}/{len(to_update)} entries with spotify_id/spotify_url. Saved {ALBUMS_FILE.name}")


if __name__ == "__main__":
    main()
