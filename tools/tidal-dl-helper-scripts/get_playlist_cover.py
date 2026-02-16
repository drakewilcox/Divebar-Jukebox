#!/usr/bin/env python3
"""
Fetch a Spotify playlist's cover image and save it to a file.

Usage:
  python get_playlist_cover.py <spotify_playlist_link> [output_path]

Pass the full link from Spotify (Share → Copy link to playlist), e.g.:
  https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M

  python get_playlist_cover.py "https://open.spotify.com/playlist/..."
  python get_playlist_cover.py "https://..." my_cover.jpg
  python get_playlist_cover.py "https://..." --size 640    # prefer 640px width (or closest)
  python get_playlist_cover.py "https://..." --size smallest

Uses same auth as other Spotify scripts (SPOTIPY_* / .env, .spotify_cache).
Requires playlist-read-private scope for your playlists; public playlists may work with default.
"""
import argparse
import re
import sys
import urllib.request
from pathlib import Path

from spotify_auth import get_spotify_client

SCOPE_PLAYLIST = "playlist-read-private playlist-read-collaborative"


# Spotify playlist link: .../playlist/<22-char base62 id> (optional ?query after)
SPOTIFY_PLAYLIST_LINK_RE = re.compile(r"open\.spotify\.com/playlist/([a-zA-Z0-9]{22})(?:\?|$|/)")


def extract_playlist_id_from_link(link: str) -> str | None:
    """Get playlist ID from a Spotify playlist link. Returns None if not a valid link."""
    link = (link or "").strip().replace("\\", "")  # normalize escaped pastes e.g. \?si\=
    if not link:
        return None
    m = SPOTIFY_PLAYLIST_LINK_RE.search(link)
    if m:
        return m.group(1)
    return None


def pick_image(images: list[dict], size_arg: str) -> dict | None:
    """Choose one image from the list. size_arg: 'largest', 'smallest', or a number (e.g. 640)."""
    if not images:
        return None
    if size_arg == "smallest":
        # Smallest by width (or first if widths are null, e.g. custom uploads)
        return min(images, key=lambda i: (i.get("width") or 0) or float("inf"))
    if size_arg == "largest" or size_arg is None:
        # Largest by width (default when --size is not specified)
        return max(images, key=lambda i: i.get("width") or 0)
    try:
        want_w = int(size_arg)
    except ValueError:
        return max(images, key=lambda i: i.get("width") or 0)
    # Closest available width (some images have null width for custom uploads)
    best = images[0]
    best_diff = float("inf")
    for img in images:
        w = img.get("width")
        if w is not None and (abs(w - want_w) < best_diff):
            best_diff = abs(w - want_w)
            best = img
    return best


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download a Spotify playlist cover image.",
        epilog="Use the full link from Spotify: Share → Copy link to playlist.",
    )
    parser.add_argument("link", help="Spotify playlist link (e.g. https://open.spotify.com/playlist/...)")
    parser.add_argument("output_path", nargs="?", default=None, help="Output file path (default: <playlist_name>.jpg in cwd)")
    parser.add_argument(
        "--size",
        default="largest",
        metavar="SIZE",
        help="Image size: largest (default), smallest, or width in px e.g. 640 or 300",
    )
    args = parser.parse_args()

    playlist_link = args.link
    out_path = Path(args.output_path) if args.output_path else None

    playlist_id = extract_playlist_id_from_link(playlist_link)
    if not playlist_id:
        print(
            "Could not parse Spotify playlist link. Paste the full link, e.g.:",
            file=sys.stderr,
        )
        print("  https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", file=sys.stderr)
        sys.exit(1)

    sp = get_spotify_client(scope=SCOPE_PLAYLIST)
    try:
        playlist = sp.playlist(playlist_id)
    except Exception as e:
        print(f"Failed to get playlist: {e}", file=sys.stderr)
        sys.exit(1)

    images = playlist.get("images") or []
    if not images:
        print("This playlist has no cover image.", file=sys.stderr)
        sys.exit(1)

    img = pick_image(images, args.size)
    url = img.get("url") if img else None
    if not url:
        print("No image URL in response.", file=sys.stderr)
        sys.exit(1)

    if out_path is None:
        name = (playlist.get("name") or "playlist_cover").replace("/", "-").replace("\\", "-")[:80]
        out_path = Path.cwd() / f"{name}.jpg"
    else:
        out_path = Path(out_path)

    try:
        urllib.request.urlretrieve(url, out_path)
    except Exception as e:
        print(f"Failed to download image: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Saved to {out_path.resolve()}")


if __name__ == "__main__":
    main()
