#!/usr/bin/env python3
"""
Use tidal-dl-ng to download albums from albums_to_download.json.

Reads albums_to_download.json, collects every entry that has a valid tidal_url
and does not have downloaded=true, writes them to tidal_dl_urls.txt, and
optionally runs tidal-dl-ng.

Usage:
  python download_with_tidal_dl_ng.py
    → Writes tidal_dl_urls.txt and prints the command to run.

  python download_with_tidal_dl_ng.py --run
    → Same, then runs tidal-dl-ng for you (requires tidal-dl-ng on PATH or
       TIDAL_DL_NG env set to the tidal-dl-ng executable). On success, sets
       downloaded=true in albums_to_download.json for all albums in this run.

  python download_with_tidal_dl_ng.py --limit 20 [--run]
    → Only include the first 20 eligible albums in the URL list (and run, if --run).
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

_PROJECT_DIR = Path(__file__).resolve().parent
ALBUMS_FILE = _PROJECT_DIR / "albums_to_download.json"
URLS_FILE = _PROJECT_DIR / "tidal_dl_urls.txt"
# Default path to tidal-dl-ng (venv bin). Override with env TIDAL_DL_NG.
DEFAULT_TIDAL_DL_NG = Path.home() / "tools" / "tidal-dl-ng" / "venv" / "bin" / "tidal-dl-ng"


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare or run tidal-dl-ng for resolved albums.")
    parser.add_argument(
        "--run",
        action="store_true",
        help="Run tidal-dl-ng after writing the URL list (tidal-dl-ng must be on PATH or set TIDAL_DL_NG).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Only include the first N eligible albums (default: all).",
    )
    args = parser.parse_args()

    if not ALBUMS_FILE.exists():
        print(f"Missing {ALBUMS_FILE}. Run resolve_tidal.py first.")
        sys.exit(1)

    albums = json.loads(ALBUMS_FILE.read_text(encoding="utf-8"))
    urls = []
    indices_in_run = []  # album indices included in this URL list
    for i, entry in enumerate(albums):
        if entry.get("downloaded"):
            continue
        url = entry.get("tidal_url")
        if url and isinstance(url, str) and url.strip():
            urls.append(url.strip())
            indices_in_run.append(i)
            if args.limit is not None and len(urls) >= args.limit:
                break

    if not urls:
        print("No tidal_url entries in the list. Run resolve_tidal.py first.")
        sys.exit(1)

    URLS_FILE.write_text("\n".join(urls) + "\n", encoding="utf-8")
    if args.limit is not None:
        print(f"Wrote {len(urls)} URLs to {URLS_FILE} (limit {args.limit})")
    else:
        print(f"Wrote {len(urls)} URLs to {URLS_FILE}")

    cmd_instruction = (
        "cd ~/tools/tidal-dl-ng && source venv/bin/activate && "
        f"tidal-dl-ng dl -l {URLS_FILE.resolve()}"
    )
    print("\nTo download with tidal-dl-ng, run:")
    print(f"  {cmd_instruction}")
    print("\nOr from any directory (with tidal-dl-ng venv activated):")
    print(f"  tidal-dl-ng dl -l {URLS_FILE.resolve()}")

    if args.run:
        tidal_dl_ng = os.environ.get("TIDAL_DL_NG", str(DEFAULT_TIDAL_DL_NG))
        if not Path(tidal_dl_ng).exists() and tidal_dl_ng == str(DEFAULT_TIDAL_DL_NG):
            print(f"\n--run: tidal-dl-ng not found at {DEFAULT_TIDAL_DL_NG}")
            print("Activate the tidal-dl-ng venv and run the command above, or set TIDAL_DL_NG to the executable.")
            sys.exit(1)
        print(f"\nRunning: {tidal_dl_ng} dl -l {URLS_FILE.resolve()}")
        rc = subprocess.call([tidal_dl_ng, "dl", "-l", str(URLS_FILE.resolve())])
        if rc == 0 and indices_in_run:
            for i in indices_in_run:
                albums[i]["downloaded"] = True
            ALBUMS_FILE.write_text(
                json.dumps(albums, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            print(f"Marked {len(indices_in_run)} album(s) as downloaded in {ALBUMS_FILE.name}")
        sys.exit(rc)


if __name__ == "__main__":
    main()
