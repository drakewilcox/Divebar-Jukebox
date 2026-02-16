#!/usr/bin/env python3
"""
Resolve albums from albums_to_download.json on Tidal and add tidal_url to each entry.

Requires Tidal login (once). On first run you'll be asked to open a link and authorize;
the session is saved to .tidal_session.json. For each album we search Tidal, then pick
the best-matching result (album name + artist must match) to avoid wrong albums.

Skips entries that already have a tidal_url (resolved) or have downloaded=true. Use --force to re-resolve.
"""
import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

from tidalapi import Album, Session

_PROJECT_DIR = Path(__file__).resolve().parent
ALBUMS_FILE = _PROJECT_DIR / "albums_to_download.json"
SESSION_FILE = _PROJECT_DIR / ".tidal_session.json"
# Rate limit: delay between Tidal API search requests (seconds)
SEARCH_DELAY = 0.5


def _normalize(s: str) -> str:
    """Lowercase, strip, collapse spaces."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _normalize_for_match(s: str) -> str:
    """Like _normalize but also &/+ -> 'and' and strip accents, for lenient scoring."""
    if not s:
        return ""
    s = (s or "").strip().lower()
    s = re.sub(r"\s*&\s*", " and ", s)
    s = re.sub(r"\s+\+\s+", " and ", s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def _sanitize_for_search(s: str) -> str:
    """
    Make a string safe for Tidal search: remove parentheticals, normalize
    characters that often break or confuse search (&, +, accents, etc.).
    Used only for the query string; scoring still uses original names.
    """
    if not s:
        return ""
    s = (s or "").strip()
    # Remove parenthetical content e.g. "Album (Remaster)" or "Artist (2)"
    s = re.sub(r"\s*\([^)]*\)\s*", " ", s)
    # Remove brackets and their content e.g. "Album [2024]"
    s = re.sub(r"\s*\[[^\]]*\]\s*", " ", s)
    # Remove & from query (replace with space) so Tidal search finds "Echo The Bunnymen" etc.
    s = re.sub(r"\s*&\s*", " ", s)
    s = re.sub(r"\s+\+\s+", " and ", s)
    # Colons and slashes -> space so they don't split the query
    s = s.replace(":", " ").replace("/", " ")
    # Strip quotes and apostrophes (straight and curly)
    s = s.replace('"', " ").replace("'", "").replace("'", "").replace("'", "")
    # Optional: strip ! and ? so "Yes Lawd!" doesn't confuse
    s = s.replace("!", " ").replace("?", " ")
    # Normalize accents for search: é -> e, ü -> u (Tidal often matches ASCII)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def build_search_query(entry: dict) -> str:
    """Build 'Artist(s) Album Name' for Tidal search. Sanitizes for () and special chars."""
    artists = entry.get("artists") or []
    names = [a.get("name", "").strip() for a in artists if a.get("name")]
    album_name = (entry.get("name") or "").strip()
    # Various Artists: search by album name only so Tidal finds compilations
    if names and _normalize(names[0]) == "various artists":
        return _sanitize_for_search(album_name) if album_name else ""
    parts = [_sanitize_for_search(n) for n in names if n] + [_sanitize_for_search(album_name)]
    parts = [p for p in parts if p]
    return " ".join(parts) if parts else ""


def _score_match(entry: dict, tidal_album) -> tuple[int, bool]:
    """
    Score how well a Tidal search result matches our wanted album/artists.
    Returns (score, acceptable). acceptable = True only if both album and artist match.
    Uses lenient normalization (&/and, accents) so Tidal results still match.
    """
    want_album = _normalize_for_match(entry.get("name") or "")
    want_artists = {
        _normalize_for_match(a.get("name") or "")
        for a in (entry.get("artists") or [])
        if a.get("name")
    }
    got_album = _normalize_for_match(getattr(tidal_album, "name", None) or "")
    got_artists = set()
    for a in (getattr(tidal_album, "artists", None) or []):
        n = _normalize_for_match(getattr(a, "name", None) or "")
        if n:
            got_artists.add(n)
    artist = getattr(tidal_album, "artist", None)
    if artist and getattr(artist, "name", None):
        n = _normalize_for_match(artist.name)
        if n:
            got_artists.add(n)

    # Album: exact match = 2, one contains the other = 1, else 0
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

    # Artist: at least one wanted artist matches a Tidal artist (exact or substring)
    artist_ok = bool(want_artists & got_artists) or any(
        wa in ga or ga in wa for wa in want_artists for ga in got_artists
    )
    artist_score = 1 if artist_ok else 0

    score = album_score + artist_score
    # Only accept if both album and artist match to avoid wrong album (e.g. same "30th Anniversary" title, different artist)
    acceptable = album_ok and artist_ok
    return score, acceptable


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve album list to Tidal URLs.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-resolve all entries (ignore existing tidal_url). Use to fix wrong matches.",
    )
    args = parser.parse_args()

    if not ALBUMS_FILE.exists():
        print(f"Missing {ALBUMS_FILE}. Copy albums_to_download.json.example and edit it.")
        return

    albums: list[dict] = json.loads(ALBUMS_FILE.read_text(encoding="utf-8"))
    if not albums:
        print("No albums in file.")
        return

    session = Session()
    if not session.login_session_file(SESSION_FILE):
        print("Tidal login failed.")
        return

    matched = 0
    for i, entry in enumerate(albums):
        query = build_search_query(entry)
        if not query:
            entry["no_match"] = True
            entry["tidal_url"] = None
            continue
        # Skip if already downloaded (unless --force)
        if not args.force and entry.get("downloaded"):
            matched += 1
            continue
        # Skip if already resolved: has a valid tidal_url and not marked no_match
        if not args.force and entry.get("tidal_url") and not entry.get("no_match"):
            matched += 1
            continue
        try:
            result = session.search(query=query, models=[Album], limit=10)
            album_list = result.get("albums") or []
            chosen = None
            best_score = -1
            for candidate in album_list:
                score, acceptable = _score_match(entry, candidate)
                if acceptable and score > best_score:
                    best_score = score
                    chosen = candidate
            if chosen:
                url = getattr(chosen, "share_url", None) or (
                    f"https://tidal.com/browse/album/{chosen.id}" if chosen.id else None
                )
                if url:
                    entry["tidal_url"] = url
                    entry["no_match"] = False
                    matched += 1
                    print(f"  [{i+1}/{len(albums)}] {query!r} -> {url}")
                else:
                    entry["tidal_url"] = None
                    entry["no_match"] = True
                    print(f"  [{i+1}/{len(albums)}] {query!r} -> no URL")
            else:
                entry["tidal_url"] = None
                entry["no_match"] = True
                msg = "no results" if not album_list else "no matching result (album+artist)"
                print(f"  [{i+1}/{len(albums)}] {query!r} -> {msg}")
        except Exception as e:
            entry["tidal_url"] = None
            entry["no_match"] = True
            print(f"  [{i+1}/{len(albums)}] {query!r} -> error: {e}")
        time.sleep(SEARCH_DELAY)

    ALBUMS_FILE.write_text(json.dumps(albums, indent=2), encoding="utf-8")
    print(f"\nResolved {matched}/{len(albums)} albums. Updated {ALBUMS_FILE}")


if __name__ == "__main__":
    main()
